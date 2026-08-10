/**
 * Dosing shared types.
 *
 * NOTE: The gravimetric control loop runs on the Raspberry Pi in
 * `dose_controller.py` (PiDoseController) — it owns the direct scale feed and
 * BLE cancel and survives a tablet disconnect. The browser talks to it via
 * `PiDoseProxy` + the WebSocket relay.
 *
 * This file used to also contain a browser-side `DoseController` engine, but it
 * had ZERO callers (everything used PiDoseProxy), so any tuning here was a no-op.
 * That dead class has been removed to avoid two divergent controllers; only the
 * shared type surface below remains. Precision/accuracy logic now lives solely
 * in `dose_controller.py`.
 */

export type DoseState = 'idle' | 'armed' | 'running' | 'stopping' | 'settling' | 'done' | 'aborted';

export interface DoseConfig {
    /** Target dispensed weight in kg */
    targetKg: number;
    /** Unique identifier for this silo (used for persistence key) */
    siloId: string;
}

/**
 * Per-silo learned profile, persisted on the Pi.
 * Updated after every completed dose (see dose_controller.py).
 */
export interface SiloProfile {
    /** Estimated flow rate kg/s (EMA) — used for the preemptive backstop timer */
    flowRateKgPerS: number;
    /** Estimated time from stop-signal to valve fully closed (derived, display) */
    valveDelayS: number;
    /** Learned coast-down material in kg — the primary control quantity */
    overshootKg?: number;
    /** Total number of completed doses (confidence indicator) */
    totalDoses: number;
    /** Recent overshoot values in kg (shown in Settings; legacy display field) */
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

/**
 * Minimal interface for anything that drives BrewMonitor (the Pi-side proxy).
 */
export interface DoseControllerLike {
    events: DoseEvents;
    getConfig(): Readonly<DoseConfig>;
    getState(): DoseState;
    abort(reason: string): void;
}
