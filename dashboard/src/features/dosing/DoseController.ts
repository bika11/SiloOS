/**
 * DoseController — Precision Gravimetric Dosing Engine
 *
 * Works in KILOGRAMS throughout. Uses a two-pronged approach:
 *   1. Timer-based preemptive stop (fires before weight samples can arrive)
 *   2. Weight-based confirmation / settling detection
 *
 * After each dose the controller learns flow rate and valve delay per silo,
 * persisting the profile on the Pi so accuracy improves over runs.
 *
 * Accuracy features:
 *   - Quantization-aware stop (P1): rounds to 0.1 kg scale resolution
 *   - Adaptive EMA (P2): learns aggressively early, smooths later
 *   - Bias correction (P3): tracks overshoot trend and compensates
 *   - Step-change flow detection (P4): computes flow rate from 0.1 kg jumps
 *
 * State machine: idle → armed → running → stopping → settling → done | aborted
 */

import { SiloManager } from '../../bluetooth/SiloManager';
import { logger } from '../../utils/logger';

// ============================================================
// CONSTANTS
// ============================================================

/** Scale hardware resolution — Laumas TLS485 reports in 0.1 kg steps */
const SCALE_QUANTA_KG = 0.1;

/** Number of recent overshoot values to keep for bias correction (P3) */
const BIAS_HISTORY_SIZE = 5;

// ============================================================
// TYPES
// ============================================================

export type DoseState = 'idle' | 'armed' | 'running' | 'stopping' | 'settling' | 'done' | 'aborted';

export interface DoseConfig {
    /** Target dispensed weight in kg */
    targetKg: number;
    /** Unique identifier for this silo (used for persistence key) */
    siloId: string;
}

/**
 * Per-silo learned profile, persisted on the Pi via SiloManager.
 * Updated after every completed dose using exponential moving average.
 */
export interface SiloProfile {
    /** Estimated flow rate kg/s (EMA) */
    flowRateKgPerS: number;
    /** Estimated time from stop-signal to valve fully closed (EMA) */
    valveDelayS: number;
    /** Total number of completed doses (confidence indicator) */
    totalDoses: number;
    /** Recent overshoot values in kg for bias correction (P3) */
    recentOvershootsKg: number[];
}

export interface DoseResult {
    targetKg: number;
    actualKg: number;
    overshootKg: number;
    durationMs: number;
    flowRateKgPerS: number;
}

export interface DoseUpdate {
    dispensedKg: number;
    targetKg: number;
    flowRateKgPerS: number;
    state: DoseState;
    progress: number; // 0.0 – 1.0
}

export interface DoseEvents {
    onUpdate?: (update: DoseUpdate) => void;
    onComplete?: (result: DoseResult) => void;
    onAbort?: (reason: string) => void;
}

// ============================================================
// DEFAULT PROFILE (used on first dose for unknown silo)
// ============================================================

/** Conservative defaults: low flow rate → long timer → under-dose on first run.
 *  After the first dose the real flow rate is learned and subsequent doses converge. */
const DEFAULT_PROFILE: SiloProfile = {
    flowRateKgPerS: 0.05,   // 50 g/s — cautious start, real silos may be faster
    valveDelayS: 0.5,       // 0.5 s valve coast-down
    totalDoses: 0,
    recentOvershootsKg: [],
};


// ============================================================
// CONTROLLER
// ============================================================

interface WeightSample {
    weightKg: number;
    timestamp: number; // performance.now() ms
}

export class DoseController {
    private config: DoseConfig;
    private siloManager: SiloManager;
    public events: DoseEvents;
    private profile: SiloProfile;

    private state: DoseState = 'idle';
    private tareWeightKg: number = 0;
    private startTime: number = 0;
    private stopTime: number = 0;
    private samples: WeightSample[] = [];
    private lastDispensedKg: number = 0;
    private onStopCallback: (() => void) | null = null;
    private preemptiveTimer: ReturnType<typeof setTimeout> | null = null;
    private settleTimer: ReturnType<typeof setTimeout> | null = null;

    // Stall detection
    private lastActivityTime: number = 0;
    private lastKnownWeight: number = 0;

    // P4: Step-change flow detection — tracks the last confirmed quantized
    // weight step and its timestamp to compute accurate flow rate from
    // the coarse 0.1 kg scale resolution.
    private lastQuantizedKg: number = 0;
    private lastStepTime: number = 0;
    private stepFlowRateKgPerS: number = 0;

    constructor(events: DoseEvents, config: DoseConfig, siloManager: SiloManager) {
        this.config = config;
        this.events = events;
        this.siloManager = siloManager;
        this.profile = this.loadProfile(config.siloId);
        logger.info('DoseCtrl',
            `Silo "${config.siloId}" profile: flow=${this.profile.flowRateKgPerS.toFixed(3)} kg/s, ` +
            `valveDelay=${this.profile.valveDelayS.toFixed(2)}s, doses=${this.profile.totalDoses}, ` +
            `bias=${this.computeBiasCorrection().toFixed(3)}kg`
        );
    }

    // --------------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------------

    getState(): DoseState { return this.state; }
    getConfig(): Readonly<DoseConfig> { return this.config; }
    getProfile(): Readonly<SiloProfile> { return this.profile; }

    /**
     * Record the tare (baseline) weight in kg.
     * Call immediately before sending the brew command.
     */
    tare(currentWeightKg: number): void {
        this.tareWeightKg = currentWeightKg;
        this.samples = [];
        this.lastDispensedKg = 0;
        this.lastQuantizedKg = 0;
        this.lastStepTime = 0;
        this.stepFlowRateKgPerS = 0;
        this.setState('armed');
        logger.info('DoseCtrl', `Tared at ${(currentWeightKg * 1000).toFixed(0)} g`);
    }

    /**
     * Begin dosing. Call immediately after sending the brew/open-valve command.
     * Sets a preemptive timer based on learned flow rate — fires the stop callback
     * before any weight samples can even arrive, preventing overshoot.
     */
    start(onStop: () => void): void {
        if (this.state !== 'armed') {
            logger.warn('DoseCtrl', `Cannot start from state "${this.state}" — must tare first`);
            return;
        }
        this.onStopCallback = onStop;
        this.startTime = performance.now();
        this.lastActivityTime = this.startTime;
        this.lastKnownWeight = this.lastDispensedKg;
        this.setState('running');

        // --- Preemptive timer ---
        // P1: Quantization-aware stop — round effective target DOWN to the
        // nearest 0.1 kg scale step. This ensures we always aim for a value
        // the scale can actually report, biasing toward slight undershoot.
        const overshootKg = this.profile.flowRateKgPerS * this.profile.valveDelayS;

        // P3: Bias correction — subtract the average recent overshoot trend
        // to compensate for systematic errors
        const biasCorrection = this.computeBiasCorrection();

        // P1: Round down to nearest scale quantum (0.1 kg)
        const rawTarget = this.config.targetKg - overshootKg - biasCorrection;
        const effectiveTarget = Math.max(
            SCALE_QUANTA_KG,
            Math.floor(rawTarget / SCALE_QUANTA_KG) * SCALE_QUANTA_KG
        );

        const msUntilStop = Math.max(100, (effectiveTarget / this.profile.flowRateKgPerS) * 1000);

        logger.info('DoseCtrl',
            `Dosing started → target=${(this.config.targetKg * 1000).toFixed(0)}g ` +
            `effectiveTarget=${(effectiveTarget * 1000).toFixed(0)}g ` +
            `biasCorr=${(biasCorrection * 1000).toFixed(0)}g ` +
            `stopIn=${msUntilStop.toFixed(0)}ms ` +
            `(flow=${this.profile.flowRateKgPerS.toFixed(3)}kg/s, delay=${this.profile.valveDelayS.toFixed(2)}s)`
        );

        this.preemptiveTimer = setTimeout(() => {
            if (this.state === 'running') {
                logger.info('DoseCtrl', `Preemptive stop fired at ${(this.lastDispensedKg * 1000).toFixed(0)}g`);
                this.sendStop();
            }
        }, msUntilStop);
    }

    /**
     * Feed a new weight sample in kg. Called on every scale update from the bridge.
     * Used for display, flow rate refinement, and settling detection.
     */
    onWeight(weightKg: number): void {
        if (this.state === 'idle' || this.state === 'armed' || this.state === 'done' || this.state === 'aborted') return;

        const now = performance.now();
        const dispensedKg = Math.max(0, weightKg - this.tareWeightKg);
        this.lastDispensedKg = dispensedKg;

        this.samples.push({ weightKg: dispensedKg, timestamp: now });
        if (this.samples.length > 20) this.samples = this.samples.slice(-20);

        // P4: Step-change flow detection — detect when the scale actually
        // jumps by a full quantum (0.1 kg) and compute flow rate from that.
        // This is far more accurate than polling-based diffs because we know
        // the exact weight change (0.1 kg) and measure the time between steps.
        if (this.state === 'running') {
            const stepDelta = Math.abs(dispensedKg - this.lastQuantizedKg);
            if (stepDelta >= SCALE_QUANTA_KG * 0.9) { // 0.09 kg threshold (allows for float rounding)
                if (this.lastStepTime > 0) {
                    const stepTimeS = (now - this.lastStepTime) / 1000;
                    if (stepTimeS > 0.05) { // Ignore implausibly fast steps
                        // We know exactly 0.1 kg was dispensed in stepTimeS seconds
                        this.stepFlowRateKgPerS = SCALE_QUANTA_KG / stepTimeS;
                    }
                }
                this.lastQuantizedKg = dispensedKg;
                this.lastStepTime = now;
            }
        }

        // Use step-based flow rate if available, fall back to sample-window
        const flowRateKgPerS = this.stepFlowRateKgPerS > 0
            ? this.stepFlowRateKgPerS
            : this.computeFlowRate();
        const progress = Math.min(1, dispensedKg / this.config.targetKg);

        this.events.onUpdate?.({
            dispensedKg,
            targetKg: this.config.targetKg,
            flowRateKgPerS,
            state: this.state,
            progress,
        });

        // --- Running: weight-based safety stop (in case preemptive timer wasn't accurate) ---
        if (this.state === 'running') {
            // Hard stop if already past target (scale data arrived in time)
            if (dispensedKg >= this.config.targetKg) {
                logger.warn('DoseCtrl', `Weight-based hard stop at ${(dispensedKg * 1000).toFixed(0)}g`);
                this.sendStop();
            }

            // --- Stall Detection ---
            // If weight hasn't changed significantly (> 0.05kg) for 3 seconds, assume stalled/empty
            // Scale resolution is 0.1kg, so we check if it is exactly same or very close.
            const STALL_TIMEOUT_MS = 3000;

            if (this.samples.length > 0) {
                const lastActivity = this.lastActivityTime || this.startTime;

                // If we have gained weight since last check
                if (Math.abs(dispensedKg - this.lastKnownWeight) > 0.005) {
                    this.lastActivityTime = now;
                    this.lastKnownWeight = dispensedKg;
                } else {
                    // No change
                    if (now - lastActivity > STALL_TIMEOUT_MS) {
                        logger.warn('DoseCtrl', `STALL DETECTED: No weight change for ${(now - lastActivity).toFixed(0)}ms. Assuming done/empty.`);
                        this.sendStop();
                    }
                }
            } else {
                this.lastKnownWeight = dispensedKg;
                this.lastActivityTime = now;
            }
        }

        // --- Stopping / Settling: detect when weight has stabilised ---
        if (this.state === 'stopping' || this.state === 'settling') {
            if (this.state === 'stopping') {
                this.setState('settling');
            }
            // Start settle timer on first sample in settling state
            if (!this.settleTimer) {
                this.scheduleSettle();
            }
        }
    }

    /**
     * Abort dosing immediately.
     */
    abort(reason: string = 'User aborted'): void {
        if (this.state === 'done' || this.state === 'aborted' || this.state === 'idle') return;
        this.clearTimers();
        logger.warn('DoseCtrl', `Aborted: ${reason}`);
        this.onStopCallback?.();
        this.setState('aborted');
        this.events.onAbort?.(reason);
    }

    // --------------------------------------------------------
    // PRIVATE
    // --------------------------------------------------------

    private sendStop(): void {
        if (this.state !== 'running') return;
        this.clearTimers();
        this.stopTime = performance.now();
        this.setState('stopping');
        this.onStopCallback?.();
        logger.info('DoseCtrl', `Stop command sent at dispensed=${(this.lastDispensedKg * 1000).toFixed(0)}g`);

        // Safety: if no weight samples arrive to confirm settling, complete after max wait
        this.settleTimer = setTimeout(() => {
            if (this.state === 'stopping' || this.state === 'settling') {
                logger.warn('DoseCtrl', 'Settle timeout — completing without weight confirmation');
                this.complete();
            }
        }, (this.profile.valveDelayS + 3.0) * 1000);
    }

    private scheduleSettle(): void {
        // Reset settle timer every time a new weight arrives (wait for stable reading)
        if (this.settleTimer) clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
            if (this.state === 'settling') {
                this.complete();
            }
        }, 2000); // 2 s of no change = settled
    }

    private complete(): void {
        this.clearTimers();
        const durationMs = performance.now() - this.startTime;
        const actualKg = this.lastDispensedKg;
        const overshootKg = actualKg - this.config.targetKg;
        const durationS = durationMs / 1000;

        // Prefer step-based flow rate (P4) if available, more accurate
        const flowRateKgPerS = this.stepFlowRateKgPerS > 0
            ? this.stepFlowRateKgPerS
            : (durationS > 0.1 ? (actualKg / durationS) : this.profile.flowRateKgPerS);

        const result: DoseResult = {
            targetKg: this.config.targetKg,
            actualKg,
            overshootKg,
            durationMs,
            flowRateKgPerS,
        };

        // Learn from this dose
        this.learn(actualKg, durationS, flowRateKgPerS, overshootKg);

        this.setState('done');
        logger.info('DoseCtrl',
            `Complete! target=${(result.targetKg * 1000).toFixed(0)}g ` +
            `actual=${(result.actualKg * 1000).toFixed(0)}g ` +
            `overshoot=${(result.overshootKg * 1000).toFixed(0)}g ` +
            `flow=${result.flowRateKgPerS.toFixed(3)}kg/s`
        );
        this.events.onComplete?.(result);
    }

    /**
     * Adaptive Exponential Moving Average learning (P2).
     * Alpha is aggressive when the profile is young (few doses) and
     * smooths out as confidence grows. This means:
     *   - Dose 1: full replacement (alpha = 1.0)
     *   - Doses 2-3: 70% new data (alpha = 0.7) — learn fast
     *   - Doses 4-9: 40% new data (alpha = 0.4) — moderate
     *   - Dose 10+: 20% new data (alpha = 0.2) — stable
     */
    private learn(actualKg: number, durationS: number, flowRateKgPerS: number, overshootKg: number): void {
        if (actualKg < 0.001 || durationS < 0.1) return; // Skip bogus doses

        // P2: Adaptive alpha — aggressive when young, smooth when mature
        const doses = this.profile.totalDoses;
        const alpha = doses === 0 ? 1.0 :
            doses < 3 ? 0.7 :
                doses < 10 ? 0.4 : 0.2;

        // Flow rate learning
        this.profile.flowRateKgPerS =
            (1 - alpha) * this.profile.flowRateKgPerS + alpha * flowRateKgPerS;

        // Valve delay learning: how long did material flow after stop signal?
        // overshoot = flowRate * valveDelay → valveDelay = overshoot / flowRate
        const stopAt = (this.stopTime - this.startTime) / 1000; // when did we send stop?
        const materialAfterStop = actualKg - (flowRateKgPerS * stopAt);
        if (flowRateKgPerS > 0.001) {
            const observedDelay = materialAfterStop / flowRateKgPerS;
            const newDelay = (1 - alpha) * this.profile.valveDelayS + alpha * observedDelay;
            // Clamp to 0 to prevent negative delay (physics violation)
            this.profile.valveDelayS = Math.max(0, newDelay);
        }

        // P3: Track overshoot for bias correction
        this.profile.recentOvershootsKg.push(overshootKg);
        if (this.profile.recentOvershootsKg.length > BIAS_HISTORY_SIZE) {
            this.profile.recentOvershootsKg =
                this.profile.recentOvershootsKg.slice(-BIAS_HISTORY_SIZE);
        }

        this.profile.totalDoses++;

        // Pi-Side Persistence
        this.siloManager.updateProfiles({ [this.config.siloId]: this.profile });

        logger.info('DoseCtrl',
            `Learned: flow=${this.profile.flowRateKgPerS.toFixed(3)}kg/s ` +
            `valveDelay=${this.profile.valveDelayS.toFixed(2)}s ` +
            `doses=${this.profile.totalDoses} ` +
            `biasCorr=${this.computeBiasCorrection().toFixed(3)}kg ` +
            `alpha=${alpha.toFixed(1)}`
        );
    }

    /**
     * P3: Compute average overshoot from recent doses.
     * If recent doses consistently overshoot by X kg, we subtract X
     * from the effective target in the next dose to compensate.
     * Only applies when we have ≥2 data points for stability.
     */
    private computeBiasCorrection(): number {
        const history = this.profile.recentOvershootsKg;
        if (history.length < 2) return 0;
        const avg = history.reduce((sum, v) => sum + v, 0) / history.length;
        // Clamp to prevent over-correction (max ±0.5 kg adjustment)
        return Math.max(-0.5, Math.min(0.5, avg));
    }

    /**
     * Legacy flow rate computation — sliding window over last 5 samples.
     * Used as fallback when step-change detection (P4) hasn't fired yet.
     */
    private computeFlowRate(): number {
        const window = this.samples.slice(-5);
        if (window.length < 2) return 0;
        const first = window[0];
        const last = window[window.length - 1];
        const deltaKg = last.weightKg - first.weightKg;
        const deltaS = (last.timestamp - first.timestamp) / 1000;
        if (deltaS <= 0) return 0;
        return Math.max(0, deltaKg / deltaS);
    }

    private clearTimers(): void {
        if (this.preemptiveTimer) { clearTimeout(this.preemptiveTimer); this.preemptiveTimer = null; }
        if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null; }
    }

    private setState(state: DoseState): void {
        this.state = state;
    }

    // --------------------------------------------------------
    // PERSISTENCE
    // --------------------------------------------------------

    private loadProfile(siloId: string): SiloProfile {
        const profiles = this.siloManager.getProfiles();
        const profile = profiles[siloId];

        if (profile && typeof profile.flowRateKgPerS === 'number') {
            // Sanity clamp
            if (profile.valveDelayS > 5.0 || profile.flowRateKgPerS > 1.0 || profile.flowRateKgPerS <= 0) {
                return { ...DEFAULT_PROFILE };
            }
            // Ensure recentOvershootsKg exists (backward compat with old profiles)
            if (!Array.isArray(profile.recentOvershootsKg)) {
                profile.recentOvershootsKg = [];
            }
            return profile;
        }

        return { ...DEFAULT_PROFILE };
    }
}
