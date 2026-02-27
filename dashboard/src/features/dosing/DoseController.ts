/**
 * DoseController — Precision Gravimetric Dosing Engine
 *
 * Works in KILOGRAMS throughout. Uses a two-pronged approach:
 *   1. Timer-based preemptive stop (fires before weight samples can arrive)
 *   2. Weight-based confirmation / settling detection
 *
 * After each dose the controller learns flow rate and valve delay per silo,
 * persisting the profile in localStorage so accuracy improves over runs.
 *
 * State machine: idle → armed → running → stopping → settling → done | aborted
 */

import { logger } from '../../utils/logger';

// ============================================================
// TYPES
// ============================================================

export type DoseState = 'idle' | 'armed' | 'running' | 'stopping' | 'settling' | 'done' | 'aborted';

export interface DoseConfig {
    /** Target dispensed weight in kg */
    targetKg: number;
    /** Unique identifier for this silo (used for localStorage learning key) */
    siloId: string;
}

/**
 * Per-silo learned profile, persisted in localStorage.
 * Updated after every completed dose using exponential moving average.
 */
export interface SiloProfile {
    /** Estimated flow rate kg/s (EMA) */
    flowRateKgPerS: number;
    /** Estimated time from stop-signal to valve fully closed (EMA) */
    valveDelayS: number;
    /** Total number of completed doses (confidence indicator) */
    totalDoses: number;
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

/**
 * Minimal interface for anything that drives BrewMonitor (local or Pi-side controller).
 */
export interface DoseControllerLike {
    events: DoseEvents;
    getConfig(): Readonly<DoseConfig>;
    getState(): DoseState;
    abort(reason: string): void;
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
};

const STORAGE_PREFIX = 'silo_profile_v1_';

// ============================================================
// CONTROLLER
// ============================================================

interface WeightSample {
    weightKg: number;
    timestamp: number; // performance.now() ms
}

export class DoseController {
    private config: DoseConfig;
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

    constructor(events: DoseEvents, config: DoseConfig) {
        this.config = config;
        this.events = events;
        this.profile = this.loadProfile(config.siloId);
        logger.info('DoseCtrl',
            `Silo "${config.siloId}" profile: flow=${this.profile.flowRateKgPerS.toFixed(3)} kg/s, ` +
            `valveDelay=${this.profile.valveDelayS.toFixed(2)}s, doses=${this.profile.totalDoses}`
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
        // effectiveTarget accounts for material that will still flow after stop signal
        const overshootKg = this.profile.flowRateKgPerS * this.profile.valveDelayS;
        const effectiveTarget = Math.max(0.005, this.config.targetKg - overshootKg);
        const msUntilStop = Math.max(100, (effectiveTarget / this.profile.flowRateKgPerS) * 1000);

        logger.info('DoseCtrl',
            `Dosing started → target=${(this.config.targetKg * 1000).toFixed(0)}g ` +
            `effectiveTarget=${(effectiveTarget * 1000).toFixed(0)}g ` +
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

        const flowRateKgPerS = this.computeFlowRate();
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
            // We use the timestamp of the last sample that was different from current.
            const STALL_TIMEOUT_MS = 3000;

            // Update activity timestamp if weight changed
            // We compare with a sample from ~1s ago to be robust against jitter
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
        const flowRateKgPerS = durationS > 0.1 ? (actualKg / durationS) : this.profile.flowRateKgPerS;

        const result: DoseResult = {
            targetKg: this.config.targetKg,
            actualKg,
            overshootKg,
            durationMs,
            flowRateKgPerS,
        };

        // Learn from this dose
        this.learn(actualKg, durationS, flowRateKgPerS);

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
     * Exponential Moving Average learning.
     * alpha=0.3 means each new dose contributes 30% to the estimate.
     */
    private learn(actualKg: number, durationS: number, flowRateKgPerS: number): void {
        if (actualKg < 0.001 || durationS < 0.1) return; // Skip bogus doses

        const alpha = this.profile.totalDoses === 0 ? 1.0 : 0.3; // First dose: full replace

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

        this.profile.totalDoses++;
        this.saveProfile(this.config.siloId, this.profile);

        logger.info('DoseCtrl',
            `Learned: flow=${this.profile.flowRateKgPerS.toFixed(3)}kg/s ` +
            `valveDelay=${this.profile.valveDelayS.toFixed(2)}s ` +
            `doses=${this.profile.totalDoses}`
        );
    }

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
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + siloId);
            if (raw) {
                const parsed = JSON.parse(raw) as SiloProfile;
                if (typeof parsed.flowRateKgPerS === 'number' &&
                    typeof parsed.valveDelayS === 'number' &&
                    typeof parsed.totalDoses === 'number') {
                    return parsed;
                }
            }
        } catch {
            // ignore
        }
        return { ...DEFAULT_PROFILE };
    }

    private saveProfile(siloId: string, profile: SiloProfile): void {
        try {
            localStorage.setItem(STORAGE_PREFIX + siloId, JSON.stringify(profile));
        } catch {
            logger.warn('DoseCtrl', 'Failed to save silo profile to localStorage');
        }
    }
}
