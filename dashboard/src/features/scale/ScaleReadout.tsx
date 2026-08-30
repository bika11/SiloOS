import React, { useState, useEffect } from 'react';
import { ScaleManager, type ScaleConnectionState } from '../../bluetooth/ScaleManager';
import { SiloManager } from '../../bluetooth/SiloManager';
import { logger } from '../../utils/logger';
import './ScaleReadout.css';

interface ScaleReadoutProps {
    scaleManager: ScaleManager;
    siloManager: SiloManager;
}

export const ScaleReadout: React.FC<ScaleReadoutProps> = ({ scaleManager, siloManager }) => {
    const [booKooWeight, setBooKooWeight] = useState<number>(0);
    // Initialize safely with lazy initializer to capture current weight immediately but safely
    const [siloWeight, setSiloWeight] = useState<number>(() => {
        try {
            return siloManager.getWeight() || 0;
        } catch (e) {
            return 0;
        }
    });

    const [connState, setConnState] = useState<ScaleConnectionState>(scaleManager.getState());
    const [isSiloConnected, setIsSiloConnected] = useState(siloManager.isBridgeConnected());
    const [isPulsing, setIsPulsing] = useState(false);

    useEffect(() => {
        let pulseTimeout: any;
        const triggerPulse = () => {
            setIsPulsing(true);
            clearTimeout(pulseTimeout);
            pulseTimeout = setTimeout(() => setIsPulsing(false), 200);
        };

        // BooKoo Handlers
        const handleBooKooWeight = (w: number) => {
            setBooKooWeight(w);
            triggerPulse();
        };

        const handleBooKooConn = (state: ScaleConnectionState) => {
            setConnState(state);
            if (state === 'disconnected') setBooKooWeight(0);
        };

        // Silo Handlers
        const handleSiloWeight = (w: number) => {
            setSiloWeight(w);
            triggerPulse();
        };

        const handleSiloConn = (connected: boolean) => {
            setIsSiloConnected(connected);
            if (!connected) setSiloWeight(0);
        };

        const handleError = (err: Error) => logger.error('ScaleUI', 'Scale error', err);

        // BooKoo scale manager has a single dedicated consumer (this component).
        scaleManager['events'] = {
            onWeightUpdate: handleBooKooWeight,
            onConnectionStateChange: handleBooKooConn,
            onError: handleError,
        };

        // SiloManager is a SHARED singleton — use the additive listener API so we
        // don't wipe other consumers' handlers (e.g. the emergency global-abort).
        siloManager.addWeightListener(handleSiloWeight);
        siloManager.addConnectionListener(handleSiloConn);

        return () => {
            scaleManager['events'] = {};
            siloManager.removeWeightListener(handleSiloWeight);
            siloManager.removeConnectionListener(handleSiloConn);
            clearTimeout(pulseTimeout);
        };
    }, [scaleManager, siloManager]);

    const handleToggleConnect = async () => {
        if (connState === 'connected') {
            await scaleManager.disconnect();
        } else {
            try {
                await scaleManager.connect();
            } catch (err) {
                // Error handled by ScaleManager events
            }
        }
    };

    const effectiveWeight = connState === 'connected' ? booKooWeight : (isSiloConnected ? siloWeight : 0);
    const isAnyConnected = connState === 'connected' || isSiloConnected;
    const activeLabel = connState === 'connected' ? 'BooKoo BLE' : (isSiloConnected ? 'SiloOS Bridge' : 'Scales Offline');
    // The BooKoo BLE scale reports grams; the Laumas bridge reports kg.
    const weightUnit = connState === 'connected' ? 'g' : 'kg';

    return (
        <div className={`scale-readout ${isAnyConnected ? 'connected' : ''} ${isPulsing ? 'pulse' : ''}`}>
            <div className="scale-main">
                <div className="weight-display">
                    <span className="icon-weight">⚖️</span>
                    {isAnyConnected ? (
                        <>
                            <span className="weight-value">{effectiveWeight.toFixed(1)}</span>
                            <span className="weight-unit">{weightUnit}</span>
                        </>
                    ) : (
                        <span className="weight-placeholder">Scales Offline</span>
                    )}
                </div>

                <div className="scale-controls">
                    <button
                        className={`btn-scale ${connState === 'connected' ? 'connected' : ''}`}
                        onClick={handleToggleConnect}
                        disabled={connState === 'connecting'}
                        aria-label={connState === 'connected' ? 'Disconnect BooKoo scale' : 'Connect BooKoo scale'}
                    >
                        {connState === 'connecting' ? '...' : (connState === 'connected' ? <span aria-hidden="true">🔗</span> : 'Connect BooKoo')}
                    </button>
                </div>
            </div>

            {isAnyConnected && (
                <div className="scale-status">
                    <span className="status-dot"></span>
                    <span>{activeLabel}</span>
                </div>
            )}
        </div>
    );
};
