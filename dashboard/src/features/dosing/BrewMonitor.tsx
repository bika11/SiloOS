import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type DoseControllerLike, type DoseUpdate, type DoseResult, type DoseState } from './DoseController';
import { Button } from '../../components/ui/Button';
import { kgValue } from '../../utils/formatWeight';
import './BrewMonitor.css';

interface BrewMonitorProps {
    controller: DoseControllerLike;
    onClose: () => void;
    /** When set (n>=1), the current dose is auto-top-up n of max — shown instead of "Dispensing…". */
    topUp?: { n: number; max: number };
}

const STATE_LABEL_MAP: Record<DoseState, string> = {
    idle: 'Preparing',
    armed: 'Ready',
    running: 'Dispensing...',
    stopping: 'Closing Valve',
    settling: 'Settling',
    done: 'Complete',
    aborted: 'Aborted',
};

// SVG ring constants
const RING_RADIUS = 110;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Weight for the dose result grid — 2 decimals (finer detail than the 0.1 kg
 *  live resolution, useful when reviewing a completed dose). Uses the shared util. */
const fmtKg = (kg: number) => kgValue(kg, 2);

export const BrewMonitor: React.FC<BrewMonitorProps> = ({ controller, onClose, topUp }) => {
    const [update, setUpdate] = useState<DoseUpdate>({
        dispensedKg: 0,
        targetKg: controller.getConfig().targetKg,
        flowRateKgPerS: 0,
        state: controller.getState(),
        progress: 0,
    });
    const [result, setResult] = useState<DoseResult | null>(null);
    const [isPulsing, setIsPulsing] = useState(false);
    const [signalLost, setSignalLost] = useState(false);
    const pulseTimeout = useRef<ReturnType<typeof setTimeout>>();
    const lastUpdateRef = useRef<number>(Date.now());

    // Wire DoseController events into React state
    useEffect(() => {
        const handleUpdate = (u: DoseUpdate) => {
            lastUpdateRef.current = Date.now();
            setSignalLost(false);
            setUpdate(u);
            setIsPulsing(true);
            clearTimeout(pulseTimeout.current);
            pulseTimeout.current = setTimeout(() => setIsPulsing(false), 150);
        };

        const handleComplete = (r: DoseResult) => {
            lastUpdateRef.current = Date.now();
            setResult(r);
            setUpdate(prev => ({ ...prev, state: 'done' }));
        };

        const handleAbort = (_reason: string) => {
            lastUpdateRef.current = Date.now();
            setUpdate(prev => ({ ...prev, state: 'aborted' }));
        };

        controller.events.onUpdate = handleUpdate;
        controller.events.onComplete = handleComplete;
        controller.events.onAbort = handleAbort;

        return () => {
            controller.events.onUpdate = undefined;
            controller.events.onComplete = undefined;
            controller.events.onAbort = undefined;
            clearTimeout(pulseTimeout.current);
        };
    }, [controller]);

    // Live-pour watchdog: if updates stop arriving mid-dose, the Pi has gone
    // quiet — flip to a loud "signal lost" state instead of freezing on the last
    // weight while still saying "Dispensing…".
    useEffect(() => {
        const active = update.state === 'running' || update.state === 'stopping' || update.state === 'settling';
        if (!active) {
            setSignalLost(false);
            return;
        }
        const id = setInterval(() => {
            if (Date.now() - lastUpdateRef.current > 2500) setSignalLost(true);
        }, 500);
        return () => clearInterval(id);
    }, [update.state]);

    const handleAbort = useCallback(() => {
        controller.abort('User pressed abort');
    }, [controller]);

    // Ring progress
    const strokeDashoffset = RING_CIRCUMFERENCE * (1 - update.progress);
    const ringClass = update.progress >= 1
        ? 'complete'
        : update.progress >= 0.85
            ? 'near-target'
            : '';
    const ringOverClass = result && result.overshootKg > 0.003 ? ' over' : '';

    const stateClass = update.state;
    const isDone = update.state === 'done' || update.state === 'aborted';

    // Overshoot thresholds in kg (0.01 kg = 10 g = good, 0.05 kg = 50 g = warn)
    const overshootClass = (ovKg: number) =>
        Math.abs(ovKg) <= 0.01 ? 'good' : Math.abs(ovKg) <= 0.05 ? 'warn' : 'bad';

    return (
        <div className="brew-monitor-overlay">
            {/* Status Label */}
            <div className={`brew-monitor-status ${signalLost && !isDone ? 'aborted' : stateClass}`}>
                {signalLost && !isDone
                    ? '⚠ SIGNAL LOST — CLOSING VALVE'
                    : (topUp && topUp.n >= 1 && (update.state === 'running' || update.state === 'stopping' || update.state === 'settling')
                        ? `Topping up ${topUp.n} of ${topUp.max}`
                        : (STATE_LABEL_MAP[update.state] || update.state))}
            </div>

            {/* Circular Progress Ring */}
            <div className="brew-progress-ring">
                <svg viewBox="0 0 260 260">
                    <circle className="ring-bg" cx="130" cy="130" r={RING_RADIUS} />
                    <circle
                        className={`ring-fill ${ringClass}${ringOverClass}`}
                        cx="130"
                        cy="130"
                        r={RING_RADIUS}
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={strokeDashoffset}
                    />
                </svg>
                <div className="brew-progress-center">
                    <span className={`brew-weight-value ${isPulsing ? 'pulse' : ''}`}>
                        {fmtKg(update.dispensedKg)}
                    </span>
                    <span className="brew-weight-target">
                        / {fmtKg(update.targetKg)} kg
                    </span>
                </div>
            </div>

            {/* Flow Rate */}
            {!isDone && (
                <div className="brew-flow-rate">
                    Flow: <span className="flow-value">{update.flowRateKgPerS.toFixed(3)}</span> kg/s
                </div>
            )}

            {/* Result Summary */}
            {result && (
                <div className="brew-result">
                    <div className="brew-result-grid">
                        <div className="brew-result-item">
                            <div className="label">Target</div>
                            <div className="value">{fmtKg(result.targetKg)} kg</div>
                        </div>
                        <div className="brew-result-item">
                            <div className="label">Actual</div>
                            <div className={`value ${overshootClass(result.overshootKg)}`}>
                                {fmtKg(result.actualKg)} kg
                            </div>
                        </div>
                        <div className="brew-result-item">
                            <div className="label">Overshoot</div>
                            <div className={`value ${overshootClass(result.overshootKg)}`}>
                                {result.overshootKg > 0 ? '+' : ''}{fmtKg(result.overshootKg)} kg
                            </div>
                        </div>
                        <div className="brew-result-item">
                            <div className="label">Duration</div>
                            <div className="value">{(result.durationMs / 1000).toFixed(1)}s</div>
                        </div>
                        <div className="brew-result-item">
                            <div className="label">Flow</div>
                            <div className="value">{result.flowRateKgPerS.toFixed(3)} kg/s</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="brew-monitor-actions">
                {!isDone && (
                    <Button
                        variant="primary"
                        className="btn-abort"
                        onClick={handleAbort}
                        style={{
                            backgroundColor: '#c0121b',
                            color: '#fff',
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            padding: '1.25rem 3rem',
                            minWidth: '220px',
                            border: '2px solid #7a0b12',
                            boxShadow: '0 4px 18px rgba(192,18,27,0.5)',
                        }}
                    >
                        ■ STOP
                    </Button>
                )}
                {isDone && (
                    <Button
                        variant="secondary"
                        className="btn-done"
                        onClick={onClose}
                    >
                        DONE
                    </Button>
                )}
            </div>
        </div>
    );
};
