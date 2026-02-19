import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { TopBrewerConnection } from '../../bluetooth';
import { logger } from '../../utils/logger';
import { DrinkMenuScreen } from '../menu/DrinkMenuScreen';
import { DrinkCustomizer } from '../customization/DrinkCustomizer';
import { ScaleReadout } from '../scale/ScaleReadout';
import { ScaleManager } from '../../bluetooth/ScaleManager';
import { SiloManager } from '../../bluetooth/SiloManager';
import type { ParsedMenuItem } from '../../entities/Menu';
import { SystemStates } from '../../bluetooth/SystemStates';
import { BrewingStatus } from '../../bluetooth/BrewingStatus';

const getBrewStatusText = (state: number, progress?: number): string => {
    const progressText = progress !== undefined && progress > 0 ? ` (${progress}%)` : '';

    switch (state) {
        case BrewingStatus.GRINDING: return `Grinding...${progressText}`;
        case BrewingStatus.TAMPING: return `Tamping...${progressText}`;
        case BrewingStatus.PRE_INFUSION: return `Pre-Infusing...${progressText}`;
        case BrewingStatus.INFUSING: return `Brewing...${progressText}`;
        case BrewingStatus.DISPENSING: return `Pouring...${progressText}`;
        case BrewingStatus.PREPARING: return `Preparing...${progressText}`;
        case BrewingStatus.WARMING_UP: return `Warming up...`;
        case BrewingStatus.EJECTING: return `Finishing...${progressText}`;
        case BrewingStatus.CLEANING: return 'Cleaning Cycle...';
        case BrewingStatus.FAILED: return 'Brew Failed';
        case BrewingStatus.ABORTING: return 'Aborting...';
        case BrewingStatus.IDLE: return 'Ready';
        default: return progress !== undefined ? `Processing... (${progress}%)` : 'Ready';
    }
};

interface DashboardProps {
    connection?: TopBrewerConnection | null;
    scaleManager: ScaleManager;
    siloManager: SiloManager;
}

export const DashboardScreen: React.FC<DashboardProps> = ({ connection, scaleManager, siloManager }) => {
    const [status, setStatus] = useState<string>('Ready');
    const [logs, setLogs] = useState<any[]>([]);
    const [menuItems, setMenuItems] = useState<ParsedMenuItem[]>([]);
    const [isMenuLoading, setIsMenuLoading] = useState(false);
    const [selectedDrink, setSelectedDrink] = useState<ParsedMenuItem | null>(null);
    const hasMenuLoaded = useRef(false);

    useEffect(() => {
        if (!connection) {
            setStatus('TopBrewer Disconnected');
            setMenuItems([]);
            return;
        }

        // Subscribe to menu updates
        connection.events.onMenuReceived = (items) => {
            setMenuItems(items);
            setIsMenuLoading(false);
            hasMenuLoaded.current = true; // Mark as loaded
            setStatus('Ready');
        };

        // Subscribe to state changes
        connection.events.onStateChange = (state) => {
            if (state === 'connected') {
                // Only fetch if not already loaded
                if (!hasMenuLoaded.current) {
                    logger.info('Dashboard', 'Machine connected. Requesting menu...');
                    setIsMenuLoading(true);
                    connection.requestMenu().catch(() => setIsMenuLoading(false));
                }
            } else if (state === 'error') {
                setStatus('Machine Error');
            } else if (state === 'idle') {
                hasMenuLoaded.current = false; // Reset on disconnect
                setMenuItems([]);
                setStatus('TopBrewer Disconnected');
            }
        };

        // ... brew status handler ...
        connection.events.onBrewStatusUpdate = (statusObj) => {
            if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_BREWING) {
                setStatus(getBrewStatusText(statusObj.state, statusObj.progress));
            } else if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_ERROR) {
                setStatus(`Error: ${statusObj.error}`);
            } else if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_IDLE) {
                setStatus('Ready');
            }
        };

        // Initial fetch if already connected and not loaded
        if (connection.getState() === 'connected' && !hasMenuLoaded.current) {
            setIsMenuLoading(true);
            connection.requestMenu().catch(() => setIsMenuLoading(false));
        }

        return () => {
            connection.events.onMenuReceived = undefined;
            connection.events.onStateChange = undefined;
            connection.events.onBrewStatusUpdate = undefined;
        };
    }, [connection]);

    useEffect(() => {
        // Poll logs for display (always runs)
        const logInterval = setInterval(() => {
            setLogs([...logger.getLogs()].reverse().slice(0, 10));
        }, 1000);

        return () => clearInterval(logInterval);
    }, []);

    const handleOrder = async (item: ParsedMenuItem) => {
        if (!connection) return;
        logger.info('Dashboard', `Selected: ${item.name} - Opening Customizer`);
        setSelectedDrink(item);
    };

    return (
        <div className="dashboard-content">
            {selectedDrink && connection && (
                <DrinkCustomizer
                    drink={selectedDrink}
                    connection={connection}
                    scaleManager={scaleManager}
                    siloManager={siloManager}
                    onClose={() => setSelectedDrink(null)}
                    onBrewingStart={() => setStatus('Starting...')}
                />
            )}
            <Card className={`status-card ${!connection ? 'disconnected' : ''} glass border-amber/10`}>
                <div className="flex flex-col items-center justify-center py-6">
                    <div className="machine-icon mb-4 text-4xl">{!connection ? '🔌' : '☕'}</div>
                    <h2 className="text-3xl font-mono text-amber uppercase tracking-widest font-bold">
                        {status}
                    </h2>
                </div>
                {!selectedDrink && <ScaleReadout scaleManager={scaleManager} siloManager={siloManager} />}
            </Card>

            <div className="action-section mt-6">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">
                    Drink Menu {!connection && '(Offline)'}
                </h3>
                <DrinkMenuScreen
                    items={menuItems}
                    onOrder={handleOrder}
                    isLoading={isMenuLoading}
                />
                {!connection && (
                    <p className="hint text-zinc-600 font-mono text-xs italic mt-4">
                        Connect to TopBrewer to browse menu.
                    </p>
                )}
            </div>

            <div className="log-viewer small mt-auto glass bg-black/40 border-zinc-800/50 rounded-xl p-4">
                <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-3">Recent Activity</h3>
                <div className="log-list max-h-32 overflow-y-auto pr-2">
                    {logs.map((log, i) => {
                        if (!log) return null;
                        const timeStr = log.timestamp && typeof log.timestamp === 'string' && log.timestamp.includes('T')
                            ? log.timestamp.split('T')[1].split('.')[0]
                            : '--:--:--';
                        return (
                            <div key={i} className={`log-line level-${log.level} flex gap-4 text-[11px] font-mono border-b border-white/5 py-1`}>
                                <span className="time text-zinc-600">{timeStr}</span>
                                <span className="tag text-amber/60 font-medium">[{log.tag}]</span>
                                <span className="msg text-zinc-300 truncate">{log.message}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
