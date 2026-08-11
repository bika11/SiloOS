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

import type { DoseUpdate, DoseResult } from './DoseController';
import { PiDoseProxy } from './PiDoseProxy';
import type { Recipe } from './Recipe';
import type { SiloManager, PiDoseMessage } from '../../bluetooth/SiloManager';
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
    private currentController: PiDoseProxy | null = null;
    private state: RecipeUpdate['state'] = 'idle';
    private lastStepUpdate: DoseUpdate | null = null;

    private doseUpdateHandler: ((msg: PiDoseMessage) => void) | null = null;

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

    /** Hopper capacity (kg) — mirrors the Pi's safety.hopper_abort_kg. */
    private static readonly HOPPER_CAP_KG = 130;

    public start(): void {
        if (this.state === 'running') return;

        // Upfront overflow check: refuse the WHOLE blend before dispensing anything
        // if it can't fit given what's already in the hopper. The Pi's per-step
        // gate + overflow guard are the authoritative backstops; this just gives a
        // clean early block instead of dispensing partway then rejecting mid-sequence.
        const currentKg = this.siloManager.getWeight() || 0;
        if (currentKg + this.totalTargetKg > RecipeRunner.HOPPER_CAP_KG) {
            const reason = `Blend won't fit — hopper ${currentKg.toFixed(1)}kg + ${this.totalTargetKg.toFixed(1)}kg ` +
                `exceeds ${RecipeRunner.HOPPER_CAP_KG}kg cap. Empty the hopper first.`;
            logger.warn('RecipeRunner', reason);
            this.state = 'aborted';
            this.events.onAbort?.(reason);
            return;
        }

        logger.info('RecipeRunner',
            `Starting recipe: "${this.recipe.name}" ` +
            `(${this.recipe.steps.length} steps, ${this.totalTargetKg}kg total)`
        );

        this.state = 'running';
        this.currentStepIndex = 0;
        this.cumulativeActualKg = 0;
        this.stepResults = [];

        void this.runNextStep();
    }

    private async runNextStep(): Promise<void> {
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

        // 1. Request dose from Pi and WAIT for accept/reject.
        // SAFETY: never send the hardware order until the Pi has ARMED a
        // controller. If it rejects (hopper too full, target out of range), the
        // step must NOT dispense — otherwise the machine pours uncontrolled and
        // overflows. This is what caused a 40 kg hopper + 100 kg sequence to overfill.
        this.siloManager.send({ type: 'dose_request', siloId, targetKg: effectiveTargetKg });
        const ack = await this.siloManager.awaitDoseAck(siloId);
        if (this.state === 'aborted' || this.state === 'done') return; // aborted while waiting
        if (!ack.ok) {
            this.abort(`Step ${this.currentStepIndex + 1} ("${siloId}") rejected: ${ack.reason}`);
            return; // do NOT dispense
        }

        // 2. Create PiDoseProxy
        this.currentController = new PiDoseProxy(siloId, effectiveTargetKg, this.siloManager);
        this.currentController.events = doseEvents;

        // 3. Listen to Pi dose updates
        if (this.doseUpdateHandler) {
            this.siloManager.removeDoseUpdateListener(this.doseUpdateHandler);
        }
        this.doseUpdateHandler = (msg: PiDoseMessage) => {
            if (this.currentController && msg.siloId === siloId) {
                this.currentController.handlePiMessage(msg);
            }
        };
        this.siloManager.addDoseUpdateListener(this.doseUpdateHandler);

        // 4. Send Hardware Start (only after the Pi accepted the dose)
        this.sendHardwareStart(step.menuId, effectiveTargetKg, siloId);
    }

    /**
     * Send a real BLE order to the machine to start dispensing.
     * Uses the same proven flow as DrinkCustomizer:
     *   sendCustomOrder() → DoseController monitors → cancelOrder() on stop
     */
    private async sendHardwareStart(menuId: number, targetKg: number, siloId: string): Promise<void> {
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

            // Tell Pi the order is sent
            this.siloManager.send({ type: 'dose_started', siloId });

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
                    void this.runNextStep();
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
        if (this.doseUpdateHandler) {
            this.siloManager.removeDoseUpdateListener(this.doseUpdateHandler);
            this.doseUpdateHandler = null;
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
