/**
 * RecipeRunner — Sequential Dosing Queue with Total-Weight Compensation
 *
 * Orchestrates a chain of DoseController instances, one per recipe step.
 * Each step sends a real BLE command to the machine via TopBrewerConnection.
 *
 * Compensation logic:
 *   If earlier steps overshoot, the LAST step's target is reduced so the
 *   total blend weight still hits the exact recipe target.
 */

import { DoseController, type DoseUpdate, type DoseResult } from './DoseController';
import type { Recipe } from './Recipe';
import { SiloManager } from '../../bluetooth/SiloManager';
import { TopBrewerConnection } from '../../bluetooth/TopBrewerConnection';
import { logger } from '../../utils/logger';

export interface RecipeUpdate {
    recipe: Recipe;
    currentStepIndex: number;
    currentStepUpdate: DoseUpdate | null;
    totalProgress: number;
    state: 'idle' | 'running' | 'settling' | 'done' | 'aborted';
    /** Cumulative weight dispensed across all completed steps */
    cumulativeKg: number;
    /** Total target across all steps */
    totalTargetKg: number;
}

export interface RecipeEvents {
    onUpdate?: (update: RecipeUpdate) => void;
    onComplete?: (totalActualKg: number) => void;
    onAbort?: (reason: string) => void;
}

export class RecipeRunner {
    private recipe: Recipe;
    private siloManager: SiloManager;
    private connection: TopBrewerConnection;
    public events: RecipeEvents;

    private currentStepIndex: number = -1;
    private currentController: DoseController | null = null;
    private state: RecipeUpdate['state'] = 'idle';
    private lastStepUpdate: DoseUpdate | null = null;

    /** Weight polling interval (10 Hz) */
    private weightPollTimer: ReturnType<typeof setInterval> | null = null;

    /** Tracks cumulative actual weight from all completed steps */
    private cumulativeActualKg: number = 0;

    /** Total target across all steps (used for compensation) */
    private totalTargetKg: number = 0;

    /** Results per step for final reporting */
    private stepResults: DoseResult[] = [];

    constructor(
        recipe: Recipe,
        siloManager: SiloManager,
        connection: TopBrewerConnection,
        events: RecipeEvents = {}
    ) {
        this.recipe = recipe;
        this.siloManager = siloManager;
        this.connection = connection;
        this.events = events;
        this.totalTargetKg = recipe.steps.reduce((sum, s) => sum + s.targetKg, 0);
    }

    public start(): void {
        if (this.state === 'running') return;

        logger.info('RecipeRunner',
            `Starting recipe: "${this.recipe.name}" ` +
            `(${this.recipe.steps.length} steps, ${this.totalTargetKg}kg total)`
        );

        this.state = 'running';
        this.currentStepIndex = 0;
        this.cumulativeActualKg = 0;
        this.stepResults = [];

        // Start 10 Hz weight polling
        this.weightPollTimer = setInterval(() => {
            if (this.currentController && this.state === 'running') {
                this.currentController.onWeight(this.siloManager.getWeight());
            }
        }, 100);

        this.runNextStep();
    }

    private runNextStep(): void {
        if (this.currentStepIndex >= this.recipe.steps.length) {
            this.complete();
            return;
        }

        const step = this.recipe.steps[this.currentStepIndex];
        const isLastStep = this.currentStepIndex === this.recipe.steps.length - 1;

        // --- Total-Weight Compensation ---
        // If earlier steps overshot, reduce the last step's target
        // so the total blend weight still hits the exact recipe target.
        let effectiveTargetKg = step.targetKg;
        if (isLastStep && this.stepResults.length > 0) {
            const remaining = this.totalTargetKg - this.cumulativeActualKg;
            if (remaining > 0 && Math.abs(remaining - step.targetKg) > 0.01) {
                logger.info('RecipeRunner',
                    `Compensation: original=${step.targetKg}kg, ` +
                    `adjusted=${remaining.toFixed(3)}kg ` +
                    `(cumulative overshoot: ${(this.cumulativeActualKg - (this.totalTargetKg - step.targetKg)).toFixed(3)}kg)`
                );
                effectiveTargetKg = Math.max(0.1, remaining); // Never go below 0.1kg
            }
        }

        logger.info('RecipeRunner',
            `Step ${this.currentStepIndex + 1}/${this.recipe.steps.length}: ` +
            `"${step.menuName}" (ID=${step.menuId}), target=${effectiveTargetKg}kg`
        );

        const siloId = step.menuName || `drink_${step.menuId}`;

        const doseEvents = {
            onUpdate: (u: DoseUpdate) => {
                this.lastStepUpdate = u;
                this.emitUpdate();
            },
            onComplete: (result: DoseResult) => {
                this.handleStepComplete(result);
            },
            onAbort: (reason: string) => {
                this.abort(`Step ${this.currentStepIndex + 1} aborted: ${reason}`);
            }
        };

        this.currentController = new DoseController(doseEvents, {
            siloId,
            targetKg: effectiveTargetKg
        }, this.siloManager);

        // 1. Tare the scale at current weight
        const currentWeightKg = this.siloManager.getWeight();
        this.currentController.tare(currentWeightKg);

        // 2. Send the actual hardware command to open the valve
        this.sendHardwareStart(step.menuId, effectiveTargetKg);
    }

    /**
     * Send a real BLE order to the machine to start dispensing.
     * Uses the same proven flow as DrinkCustomizer:
     *   sendCustomOrder() → DoseController monitors → cancelOrder() on stop
     */
    private async sendHardwareStart(menuId: number, targetKg: number): Promise<void> {
        try {
            // Calculate cups needed: enough so the machine doesn't run out
            // before DoseController sends the stop signal. +2 buffer for safety.
            const nominalKg = 1; // Conservative default
            const cups = Math.min(255, Math.ceil(targetKg / nominalKg) + 2);

            await this.connection.sendCustomOrder({
                menuId,
                cups,
                cupSize: -1,       // Use machine default per cycle
                ingredients: [],   // No ingredient customization
            });

            logger.info('RecipeRunner', `Hardware START sent: menuId=${menuId}, cups=${cups}`);

            // Now start the DoseController — it will call our onStop callback
            // when the target weight is reached
            if (this.state !== 'running' || !this.currentController) return;

            this.currentController.start(() => {
                // STOP callback — DoseController says: close the valve NOW
                logger.info('RecipeRunner', `Hardware STOP: cancelling order for menuId=${menuId}`);
                this.connection.cancelOrder();
            });

        } catch (err) {
            logger.error('RecipeRunner', `Failed to send hardware command: ${err}`);
            this.abort(`Hardware command failed for step ${this.currentStepIndex + 1}`);
        }
    }

    private handleStepComplete(result: DoseResult): void {
        this.stepResults.push(result);
        this.cumulativeActualKg += result.actualKg;

        logger.info('RecipeRunner',
            `Step ${this.currentStepIndex + 1} complete: ` +
            `target=${result.targetKg.toFixed(3)}kg, actual=${result.actualKg.toFixed(3)}kg, ` +
            `overshoot=${result.overshootKg.toFixed(3)}kg, ` +
            `cumulative=${this.cumulativeActualKg.toFixed(3)}kg / ${this.totalTargetKg}kg`
        );

        this.currentStepIndex++;

        if (this.currentStepIndex < this.recipe.steps.length) {
            // Wait for mechanical settling before switching silos
            this.state = 'settling';
            this.emitUpdate();
            setTimeout(() => {
                if (this.state === 'settling') {
                    this.state = 'running';
                    this.runNextStep();
                }
            }, 3000);
        } else {
            this.complete();
        }
    }

    private complete(): void {
        this.cleanup();
        this.state = 'done';
        this.emitUpdate();
        logger.info('RecipeRunner',
            `Recipe "${this.recipe.name}" complete! ` +
            `Total: ${this.cumulativeActualKg.toFixed(3)}kg / ${this.totalTargetKg}kg`
        );
        this.events.onComplete?.(this.cumulativeActualKg);
    }

    public abort(reason: string = 'User aborted'): void {
        if (this.state === 'done' || this.state === 'aborted') return;

        this.cleanup();
        this.state = 'aborted';
        this.currentController?.abort(reason);

        // Also cancel any active machine order
        this.connection.cancelOrder().catch(() => { });

        this.emitUpdate();
        logger.warn('RecipeRunner', `Recipe aborted: ${reason}`);
        this.events.onAbort?.(reason);
    }

    private cleanup(): void {
        if (this.weightPollTimer) {
            clearInterval(this.weightPollTimer);
            this.weightPollTimer = null;
        }
    }

    private emitUpdate(): void {
        const totalSteps = this.recipe.steps.length;
        const baseProgress = Math.min(this.currentStepIndex, totalSteps) / totalSteps;
        const stepProgress = (this.lastStepUpdate?.progress || 0) / totalSteps;

        const update: RecipeUpdate = {
            recipe: this.recipe,
            currentStepIndex: this.currentStepIndex,
            currentStepUpdate: this.lastStepUpdate,
            totalProgress: Math.min(1, baseProgress + stepProgress),
            state: this.state,
            cumulativeKg: this.cumulativeActualKg + (this.lastStepUpdate?.dispensedKg || 0),
            totalTargetKg: this.totalTargetKg,
        };

        this.events.onUpdate?.(update);
    }

    public getState(): RecipeUpdate['state'] {
        return this.state;
    }
}
