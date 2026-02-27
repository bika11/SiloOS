/**
 * PiDoseProxy — Translates Pi WebSocket dose_update messages into
 * DoseController events for BrewMonitor display.
 *
 * BrewMonitor doesn't know or care whether the dose is controlled locally
 * or by the Pi. This proxy makes Pi-driven doses look identical.
 */

import type { DoseControllerLike, DoseConfig, DoseEvents, DoseState, DoseResult } from './DoseController';
import type { SiloManager } from '../../bluetooth/SiloManager';

export class PiDoseProxy implements DoseControllerLike {
    events: DoseEvents = {};
    private config: DoseConfig;
    private state: DoseState = 'armed';
    private siloManager: SiloManager;

    constructor(siloId: string, targetKg: number, siloManager: SiloManager) {
        this.config = { siloId, targetKg };
        this.siloManager = siloManager;
    }

    getConfig(): Readonly<DoseConfig> { return this.config; }
    getState(): DoseState { return this.state; }

    abort(reason: string): void {
        this.siloManager.sendTelemetry({
            type: 'dose_abort',
            siloId: this.config.siloId,
            reason,
        });
    }

    /**
     * Handle a dose_update message from the Pi.
     * Translates it into the events BrewMonitor expects.
     */
    handlePiMessage(msg: {
        state: DoseState;
        dispensedKg?: number;
        targetKg?: number;
        progress?: number;
        flowRateKgPerS?: number;
        result?: DoseResult;
        reason?: string;
    }): void {
        this.state = msg.state;

        if (msg.state === 'done' && msg.result) {
            this.events.onComplete?.(msg.result);
        } else if (msg.state === 'aborted') {
            this.events.onAbort?.(msg.reason || 'Aborted');
        } else {
            this.events.onUpdate?.({
                dispensedKg: msg.dispensedKg ?? 0,
                targetKg: msg.targetKg ?? this.config.targetKg,
                flowRateKgPerS: msg.flowRateKgPerS ?? 0,
                state: msg.state,
                progress: msg.progress ?? 0,
            });
        }
    }
}
