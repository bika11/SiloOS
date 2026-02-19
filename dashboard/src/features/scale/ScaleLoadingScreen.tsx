import React from 'react';
import type { ScaleConnectionState } from '../../bluetooth/ScaleManager';

interface ScaleLoadingScreenProps {
    isStabilizing: boolean;
    currentWeight: number;
    targetWeight: number;
    connectionState: ScaleConnectionState;
    onCancel: () => void;
}

export const ScaleLoadingScreen: React.FC<ScaleLoadingScreenProps> = ({
    isStabilizing,
    currentWeight,
    targetWeight,
    connectionState,
    onCancel
}) => {
    const isReady = !isStabilizing && connectionState === 'connected';

    return (
        <div className="fixed inset-0 z-50 glass flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-md w-full space-y-12">
                <div className="space-y-4">
                    <h1 className={`text-4xl font-bold tracking-wide uppercase ${isReady ? 'text-success' : 'text-amber animate-pulse'}`}>
                        {connectionState !== 'connected' ? 'Connecting Scale...' :
                            isStabilizing ? 'Zeroing Scale...' : 'System Ready'}
                    </h1>
                    <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
                        {isReady ? 'Stability Confirmed' : 'Please wait for stability'}
                    </p>
                </div>

                <div className="py-12 border-y border-zinc-800">
                    <div className="flex flex-col items-center">
                        <span className="text-sm font-mono text-zinc-500 uppercase mb-2">Current Load</span>
                        <div className="flex items-baseline gap-3">
                            <span className="text-7xl font-mono font-bold tabular-nums">
                                {currentWeight.toFixed(3)}
                            </span>
                            <span className="text-2xl font-mono text-zinc-500 uppercase">kg</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {isReady ? (
                        <div className="bg-success/10 border border-success p-4 rounded-lg">
                            <p className="text-success font-mono font-bold">CALIBRATION COMPLETE</p>
                        </div>
                    ) : (
                        <div className="status-loading p-4 rounded-lg flex items-center justify-center gap-4">
                            <div className="w-4 h-4 rounded-full bg-amber animate-ping" />
                            <span className="font-mono font-bold">SENSING...</span>
                        </div>
                    )}

                    <button
                        onClick={onCancel}
                        className="btn btn-ghost w-full"
                    >
                        Abort Calibration
                    </button>
                </div>
            </div>
        </div>
    );
};
