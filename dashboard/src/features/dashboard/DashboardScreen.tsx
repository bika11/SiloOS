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
import { RecipesPanel } from '../dosing/RecipesPanel';

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
    menuItems: ParsedMenuItem[];
    hiddenRecipes: number[];
}

export const DashboardScreen: React.FC<DashboardProps> = ({
    connection,
    scaleManager,
    siloManager,
    menuItems,
    hiddenRecipes
}: DashboardProps) => {
    const [status, setStatus] = useState<string>('Ready');
    const [selectedDrink, setSelectedDrink] = useState<ParsedMenuItem | null>(null);

    useEffect(() => {
        if (!connection) {
            setStatus('TopBrewer Disconnected');
            return;
        }

        // Subscribe to state changes
        connection.events.onStateChange = (state: string) => {
            if (state === 'connected') {
                setStatus('Ready');
            } else if (state === 'error') {
                setStatus('Machine Error');
            } else if (state === 'idle') {
                setStatus('TopBrewer Disconnected');
            }
        };

        // brew status handler
        connection.events.onBrewStatusUpdate = (statusObj: any) => {
            if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_BREWING) {
                setStatus(getBrewStatusText(statusObj.state, statusObj.progress));
            } else if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_ERROR) {
                setStatus(`Error: ${statusObj.error}`);
            } else if (statusObj.systemStatus === SystemStates.STATE_SYSTEM_IDLE) {
                setStatus('Ready');
            }
        };

        return () => {
            connection.events.onStateChange = undefined;
            connection.events.onBrewStatusUpdate = undefined;
        };
    }, [connection]);

    const handleOrder = async (item: ParsedMenuItem) => {
        if (!connection) return;
        logger.info('Dashboard', `Selected: ${item.name} - Opening Customizer`);
        setSelectedDrink(item);
    };

    // Filter out hidden recipes
    const visibleItems = menuItems.filter(item => {
        const isHidden = (hiddenRecipes || []).includes(item.id);
        return !isHidden;
    });

    if (menuItems.length > 0) {
        logger.debug('Dashboard', `Visible Items: ${visibleItems.length}/${menuItems.length} (Hidden IDs: ${hiddenRecipes?.join(',')})`);
    }

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
                    items={visibleItems}
                    onOrder={handleOrder}
                    isLoading={menuItems.length === 0 && !!connection}
                />
                {!connection && (
                    <p className="hint text-zinc-600 font-mono text-xs italic mt-4">
                        Connect to TopBrewer to browse menu.
                    </p>
                )}
            </div>

            {/* Recipes Section */}
            <RecipesPanel siloManager={siloManager} />
        </div>
    );
};
