import { DoseController, type DoseUpdate, type DoseResult } from './DoseController';
import type { Recipe, RecipeStep } from './Recipe';
import { SiloManager } from '../../bluetooth/SiloManager';
import { logger } from '../../utils/logger';

export interface RecipeUpdate {
    recipe: Recipe;
    currentStepIndex: number;
    currentStepUpdate: DoseUpdate | null;
    totalProgress: number;
    state: 'idle' | 'running' | 'paused' | 'done' | 'aborted';
}

export interface RecipeEvents {
    onUpdate?: (update: RecipeUpdate) => void;
    onComplete?: () => void;
    onAbort?: (reason: string) => void;
}

/**
 * RecipeRunner — Orchestrates sequential dosing sequences
 * 
 * It manages a chain of DoseController instances, one for each step in a Recipe.
 */
export class RecipeRunner {
    private recipe: Recipe;
    private siloManager: SiloManager;
    public events: RecipeEvents;

    private currentStepIndex: number = -1;
    private currentController: DoseController | null = null;
    private state: RecipeUpdate['state'] = 'idle';
    private lastStepUpdate: DoseUpdate | null = null;

    constructor(recipe: Recipe, siloManager: SiloManager, events: RecipeEvents = {}) {
        this.recipe = recipe;
        this.siloManager = siloManager;
        this.events = events;
    }

    public start(): void {
        if (this.state === 'running') return;

        logger.info('RecipeRunner', `Starting recipe: ${this.recipe.name} (${this.recipe.steps.length} steps)`);
        this.state = 'running';
        this.currentStepIndex = 0;
        this.runNextStep();
    }

    private runNextStep(): void {
        const step = this.recipe.steps[this.currentStepIndex];
        if (!step) {
            this.complete();
            return;
        }

        logger.info('RecipeRunner', `Starting step ${this.currentStepIndex + 1}/${this.recipe.steps.length}: Silo ${step.siloId}, ${step.targetKg}kg`);

        const doseEvents = {
            onUpdate: (u: DoseUpdate) => {
                this.lastStepUpdate = u;
                this.emitUpdate();
            },
            onComplete: (_r: DoseResult) => {
                this.handleStepComplete();
            },
            onAbort: (reason: string) => {
                this.abort(`Step ${this.currentStepIndex + 1} aborted: ${reason}`);
            }
        };

        this.currentController = new DoseController(doseEvents, {
            siloId: step.siloId,
            targetKg: step.targetKg
        }, this.siloManager);

        // 1. Tare the scale
        const currentWeightKg = this.siloManager.getWeight();
        this.currentController.tare(currentWeightKg);

        // 2. Start dosing (Wait brief delay for mechanical latch/handshake)
        setTimeout(() => {
            if (this.state !== 'running') return;

            // In a real SiloOS setup, starting a dose means opening a physical valve.
            // For now, we assume the UI/User or another system triggers the hardware.
            // RecipeRunner just monitors the DoseController.
            this.currentController?.start(() => {
                // This callback is called when DoseController wants to STOP the valve
                logger.info('RecipeRunner', `Controller requested STOP for Silo ${step.siloId}`);
            });
        }, 500);
    }

    private handleStepComplete(): void {
        logger.info('RecipeRunner', `Step ${this.currentStepIndex + 1} complete.`);
        this.currentStepIndex++;

        if (this.currentStepIndex < this.recipe.steps.length) {
            // Wait for mechanical settling/handover before next silo
            setTimeout(() => {
                if (this.state === 'running') {
                    this.runNextStep();
                }
            }, 3000);
        } else {
            this.complete();
        }
    }

    private complete(): void {
        this.state = 'done';
        this.emitUpdate();
        logger.info('RecipeRunner', `Recipe "${this.recipe.name}" complete!`);
        this.events.onComplete?.();
    }

    public abort(reason: string = 'User aborted'): void {
        if (this.state === 'done' || this.state === 'aborted') return;

        this.state = 'aborted';
        this.currentController?.abort(reason);
        this.emitUpdate();
        logger.warn('RecipeRunner', `Recipe aborted: ${reason}`);
        this.events.onAbort?.(reason);
    }

    public onWeight(weightKg: number): void {
        if (this.state === 'running') {
            this.currentController?.onWeight(weightKg);
        }
    }

    private emitUpdate(): void {
        const totalSteps = this.recipe.steps.length;
        const baseProgress = this.currentStepIndex / totalSteps;
        const stepProgress = (this.lastStepUpdate?.progress || 0) / totalSteps;

        const update: RecipeUpdate = {
            recipe: this.recipe,
            currentStepIndex: this.currentStepIndex,
            currentStepUpdate: this.lastStepUpdate,
            totalProgress: Math.min(1, baseProgress + stepProgress),
            state: this.state
        };

        this.events.onUpdate?.(update);
    }

    public getState(): RecipeUpdate['state'] {
        return this.state;
    }
}
