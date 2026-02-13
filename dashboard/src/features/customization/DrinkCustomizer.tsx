import React, { useState, useEffect, useRef } from 'react';
import { TopBrewerConnection } from '../../bluetooth';
import { ScaleManager } from '../../bluetooth/ScaleManager';
import { SiloManager } from '../../bluetooth/SiloManager';
import { ScaleReadout } from '../scale/ScaleReadout';
import { BrewMonitor } from '../dosing/BrewMonitor';
import { DoseController } from '../dosing/DoseController';
import type { ParsedMenuItem } from '../../entities/Menu';
import type { MenuDetails } from '../../sfwu/types/MenuDetails';
import type { OrderIngredient } from '../../sfwu/commands/OrderCommand';
import { logger } from '../../utils/logger';

// UI Components
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import './DrinkCustomizer.css';

interface DrinkCustomizerProps {
    drink: ParsedMenuItem;
    connection: TopBrewerConnection;
    scaleManager: ScaleManager;
    siloManager: SiloManager;
    onClose: () => void;
    onBrewingStart: () => void;
}

export const DrinkCustomizer: React.FC<DrinkCustomizerProps> = ({
    drink,
    connection,
    scaleManager,
    siloManager,
    onClose,
    onBrewingStart
}) => {
    const [details, setDetails] = useState<MenuDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [customValues, setCustomValues] = useState<Record<string, number>>({});
    const [customVolume, setCustomVolume] = useState<number>(0);
    const [isGravimetric, setIsGravimetric] = useState(false);
    const [doseController, setDoseController] = useState<DoseController | null>(null);
    const weightListenerRef = useRef<((w: number) => void) | null>(null);

    // Gravimetric target weight in kg
    const [manualTarget, setManualTarget] = useState<number>(0.5);

    useEffect(() => {
        // 1. Listen for details
        const handleDetails = (data: MenuDetails) => {
            if (data.menuItemId === drink.id) {
                setDetails(data);

                // Initialize custom values with nominal ones
                const initialValues: Record<string, number> = {};
                data.ingredients.forEach(ing => {
                    ing.variants.forEach(variant => {
                        const key = `${ing.id}-${variant.id}`;
                        initialValues[key] = variant.defaultValue;
                    });
                });
                setCustomValues(initialValues);
                setCustomVolume(data.globalNom || 200);

                // Default gravimetric target: 0.5 kg (adjustable via slider)
                // Do not derive from recipe — recipe uses different unit conventions
                if (manualTarget === 0) {
                    setManualTarget(0.5);
                }
                setLoading(false);
            }
        };

        connection.events.onDrinkDetailsReceived = handleDetails;

        // 2. Request details
        logger.info('Customizer', `Requesting details for ${drink.name}`);
        connection.requestDrinkDetails(drink.id).catch((err: any) => {
            logger.error('Customizer', 'Failed to request details', err);
            setLoading(false);
        });

        // 3. Prevent getting stuck
        const timeout = setTimeout(() => {
            if (loading) {
                logger.warn('Customizer', `Timeout fetching details for ${drink.name}`);
                setLoading(false);
            }
        }, 5000);

        return () => {
            connection.events.onDrinkDetailsReceived = undefined;
            clearTimeout(timeout);
        };
    }, [drink, connection, loading]); // Added loading to dependency array to avoid stale closure issue with timeout

    // Wire weight updates to active DoseController
    useEffect(() => {
        if (!doseController) return;

        const handler = (w: number) => {
            doseController.onWeight(w); // kg, matches DoseController units
        };
        weightListenerRef.current = handler;

        // Save the original handler and attach ours
        const origHandler = siloManager['events']?.onWeightUpdate;
        siloManager['events'] = {
            ...siloManager['events'],
            onWeightUpdate: (w: number) => {
                handler(w);
                origHandler?.(w);
            },
        };

        return () => {
            weightListenerRef.current = null;
            siloManager['events'] = {
                ...siloManager['events'],
                onWeightUpdate: origHandler,
            };
        };
    }, [doseController, siloManager]);

    const handleValueChange = (ingId: number, varId: number, value: number) => {
        setCustomValues(prev => ({
            ...prev,
            [`${ingId}-${varId}`]: value
        }));
    };

    const calculateTotalVolume = () => {
        // If gravimetric is enabled, use the manual slider value!
        if (isGravimetric && manualTarget > 0) {
            return manualTarget;
        }

        if (!details) return 0;
        let total = 0;
        details.ingredients.forEach(ing => {
            ing.variants.forEach(variant => {
                if (variant.unit === 'ml') {
                    const key = `${ing.id}-${variant.id}`;
                    const value = customValues[key] !== undefined ? customValues[key] : variant.defaultValue;
                    total += value;
                }
            });
        });

        // Fallback for non-gravimetric mode (standard brew)
        if (total === 0 && details.globalNom > 0) {
            if (details.globalNom > 500) return Math.round(details.globalNom / 10);
            return details.globalNom;
        }

        return Math.round(total);
    };

    const currentVolume = calculateTotalVolume();

    const handleBrew = async () => {
        if (!details) return;

        const totalVolume = currentVolume;
        const ingredients: OrderIngredient[] = [];

        details.ingredients.forEach(ing => {
            ing.variants.forEach(variant => {
                const key = `${ing.id}-${variant.id}`;
                const value = customValues[key] !== undefined ? customValues[key] : variant.defaultValue;

                ingredients.push({
                    ingredientId: ing.id,
                    variantId: variant.id,
                    value: value
                });
            });
        });

        // Use totalVolume or customVolume (the latter is a fallback)
        const targetVolume = totalVolume > 0 ? totalVolume : customVolume;

        if (isGravimetric) {
            // --- Precision Gravimetric Dosing with Auto Top-Up ---
            const siloId = drink.name || `drink_${drink.id}`;
            const MAX_TOP_UPS = 2;
            const TOP_UP_TOLERANCE_KG = 0.01; // 10 g tolerance before triggering top-up

            /**
             * Recursive helper: runs one dose of targetKg, then auto top-ups if under-dosed.
             * topUpN = 0 for first dose, 1+ for top-up rounds.
             */
            const runDose = async (targetKg: number, topUpN: number) => {
                const ctrl = new DoseController(
                    {
                        onComplete: (result) => {
                            logger.info('Customizer',
                                `Dose #${topUpN} complete: ${result.actualKg.toFixed(3)}kg / ${result.targetKg.toFixed(3)}kg`
                            );
                            const shortfall = result.targetKg - result.actualKg;
                            if (shortfall > TOP_UP_TOLERANCE_KG && topUpN < MAX_TOP_UPS) {
                                logger.info('Customizer',
                                    `Auto top-up #${topUpN + 1}: shortfall=${(shortfall * 1000).toFixed(0)}g`
                                );
                                runDose(shortfall, topUpN + 1).catch(err =>
                                    logger.error('Customizer', 'Top-up failed', err)
                                );
                            }
                        },
                        onAbort: (reason) => {
                            logger.warn('Customizer', `Dose aborted: ${reason}`);
                        },
                    },
                    { targetKg, siloId }
                );

                // Tare at current scale weight (kg, no conversion needed)
                ctrl.tare(siloManager.getWeight());

                // Send order — cupSize -1 means machine uses nominal, scale controls stop
                await connection.sendCustomOrder({
                    menuId: drink.id,
                    cups: 1,
                    cupSize: -1,
                    ingredients,
                });

                // Preemptive timer in DoseController fires the stop callback
                ctrl.start(() => { connection.cancelOrder(); });

                setDoseController(ctrl);
            };

            try {
                onBrewingStart();
                await runDose(manualTarget, 0);
            } catch (err) {
                logger.error('Customizer', 'Failed to start gravimetric brew', err);
            }
        } else {
            // --- Standard (non-gravimetric) brew ---
            onBrewingStart();
            await connection.sendCustomOrder({
                menuId: drink.id,
                cups: 1,
                cupSize: (targetVolume === details.globalNom) ? -1 : targetVolume,
                ingredients,
            });
            onClose();
        }
    };

    if (loading) {
        return (
            <div className="customizer-overlay">
                <Card className="customizer-card loading">
                    <div className="spinner"></div>
                    <p className="text-zinc-500">Fetching Recipe...</p>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </Card>
            </div>
        );
    }

    if (!details) {
        return (
            <div className="customizer-overlay">
                <Card className="customizer-card">
                    <div className="p-4 text-center">
                        <p className="text-error mb-4">Could not load drink details.</p>
                        <Button onClick={onClose}>Close</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="customizer-overlay">
            {/* Brew Monitor Overlay (gravimetric mode) */}
            {doseController && (
                <BrewMonitor
                    controller={doseController}
                    onClose={() => {
                        setDoseController(null);
                        onClose();
                    }}
                />
            )}

            <Card className="customizer-card">
                <header className="customizer-header">
                    <div className="drink-info-left">
                        <h2 className="drink-title">{details.name || drink.name}</h2>
                    </div>
                    <div className="drink-meta">
                        <span className="text-zinc-500 text-sm">ID: {drink.id}</span>
                        <span className="total-volume">
                            {currentVolume > 0 ? `${currentVolume}ml` : `${customVolume}ml`}
                        </span>
                    </div>
                </header>

                <div className="customizer-content">
                    <div className="scale-section">
                        <ScaleReadout scaleManager={scaleManager} siloManager={siloManager} />
                    </div>

                    <label className="gravimetric-toggle">
                        <input
                            type="checkbox"
                            checked={isGravimetric}
                            onChange={(e) => setIsGravimetric(e.target.checked)}
                        />
                        <span>Enable Gravimetric Dosing (Auto-Stop)</span>
                    </label>

                    <div className="ingredient-grid">
                        {/* Manual Target Input for Gravimetric Mode */}
                        {isGravimetric && (
                            <div className="ingredient-group gravimetric-target-group">
                                <span className="ingredient-title text-amber-500">Target Weight</span>
                                <div className="gravimetric-target-input-row">
                                    <input
                                        type="number"
                                        className="gravimetric-target-input"
                                        value={manualTarget}
                                        min={0.1}
                                        max={25}
                                        step={0.1}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v) && v >= 0.1 && v <= 25) setManualTarget(v);
                                        }}
                                    />
                                    <span className="gravimetric-target-unit">kg</span>
                                </div>
                                <Slider
                                    label=""
                                    unit=""
                                    min={0.1}
                                    max={25}
                                    step={0.1}
                                    value={manualTarget}
                                    onChange={setManualTarget}
                                />
                            </div>
                        )}

                        {details.ingredients.map(ing => (
                            <div key={ing.id} className="ingredient-group">
                                <div className="ingredient-title">Ingredient {ing.id}</div>
                                {ing.variants.map(variant => {
                                    const key = `${ing.id}-${variant.id}`;
                                    const val = customValues[key];
                                    return (
                                        <div key={variant.id} className="variant-row">
                                            <Slider
                                                label={variant.name || `Var ${variant.id}`}
                                                unit={variant.unit}
                                                min={variant.min}
                                                max={variant.max}
                                                step={0.1}
                                                value={val}
                                                onChange={(v) => handleValueChange(ing.id, variant.id, v)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="customizer-actions">
                    <Button variant="secondary" onClick={onClose} size="lg">Back</Button>
                    <Button
                        variant="primary"
                        onClick={handleBrew}
                        className="brew-btn"
                        size="lg"
                    >
                        START BREWING
                    </Button>
                </div>
            </Card>
        </div>
    );
};
