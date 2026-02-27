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

    useEffect(() => {
        let didLoad = false;
        const handleDetails = (data: MenuDetails) => {
            if (data.menuItemId === drink.id) {
                didLoad = true;
                setDetails(data);

                const initialValues: Record<string, number> = {};
                data.ingredients.forEach(ing => {
                    ing.variants.forEach(variant => {
                        const key = `${ing.id}-${variant.id}`;
                        initialValues[key] = variant.defaultValue;
                    });
                });
                setCustomValues(initialValues);
                setCustomVolume(data.globalNom || 200);

                logger.info('Customizer',
                    `Recipe loaded: "${data.name}" min=${data.globalMin} nom=${data.globalNom} max=${data.globalMax} ` +
                    `ingredients=${data.ingredients.length}`
                );
                data.ingredients.forEach(ing => {
                    ing.variants.forEach(v => {
                        logger.info('Customizer',
                            `  ing=${ing.id} var=${v.id} "${v.name}" ${v.min}-${v.defaultValue}-${v.max} ${v.unit}`
                        );
                    });
                });

                setLoading(false);
            }
        };

        connection.events.onDrinkDetailsReceived = handleDetails;

        logger.info('Customizer', `Requesting details for ${drink.name}`);
        connection.requestDrinkDetails(drink.id).catch((err: any) => {
            logger.error('Customizer', 'Failed to request details', err);
            setLoading(false);
        });

        const timeout = setTimeout(() => {
            if (!didLoad) {
                logger.warn('Customizer', `Timeout fetching details for ${drink.name}`);
                setLoading(false);
            }
        }, 5000);

        return () => {
            connection.events.onDrinkDetailsReceived = undefined;
            clearTimeout(timeout);
        };
    }, [drink, connection]);

    // Wire weight updates to active DoseController
    useEffect(() => {
        if (!doseController) return;

        const handler = (w: number) => {
            doseController.onWeight(w);
        };
        weightListenerRef.current = handler;

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

    const handleBrew = async () => {
        if (!details) return;

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

        logger.info('Customizer', `Order: menuId=${drink.id} gravimetric=${isGravimetric} customVolume=${customVolume} globalNom=${details.globalNom}`);
        ingredients.forEach(i => logger.info('Customizer', `  ing=${i.ingredientId} var=${i.variantId} val=${i.value}`));

        if (isGravimetric) {
            // --- Precision Gravimetric Dosing with Auto Top-Up ---
            const siloId = drink.name || `drink_${drink.id}`;
            const MAX_TOP_UPS = 5; // User confirmed small doses are fine
            const TOP_UP_TOLERANCE_KG = 0.1; // 100g tolerance (scale resolution)

            // Convert slider value (recipe units: ml/kg) to kg for DoseController
            // CRITICAL: 1 App Unit (ml) = 1 Physical Kg. No division by 1000.
            const targetKg = customVolume;
            logger.info('Customizer', `Gravimetric target: ${targetKg.toFixed(3)} kg (1:1 mapping from ${customVolume} ${recipeUnit})`);

            const runDose = async (doseTargetKg: number, topUpN: number) => {
                const ctrl = new DoseController(
                    {
                        onComplete: (result) => {
                            siloManager.sendTelemetry({
                                type: 'dose_result', siloId,
                                targetKg: result.targetKg, actualKg: result.actualKg,
                                overshootKg: result.overshootKg, durationMs: result.durationMs,
                                flowRateKgPerS: result.flowRateKgPerS, topUpN,
                            });
                            logger.info('Customizer',
                                `Dose #${topUpN} complete: ${result.actualKg.toFixed(3)}kg / ${result.targetKg.toFixed(3)}kg`
                            );
                            const shortfall = result.targetKg - result.actualKg;

                            // If shortfall is significant, trigger top-up
                            if (shortfall > TOP_UP_TOLERANCE_KG && topUpN < MAX_TOP_UPS) {
                                logger.info('Customizer',
                                    `Auto top-up #${topUpN + 1}: shortfall=${shortfall.toFixed(3)}kg`
                                );
                                runDose(shortfall, topUpN + 1).catch(err =>
                                    logger.error('Customizer', 'Top-up failed', err)
                                );
                            } else {
                                logger.info('Customizer', `Dose finished. Shortfall ${shortfall.toFixed(3)}kg within tolerance or max retries reached.`);
                            }
                        },
                        onAbort: (reason) => {
                            siloManager.sendTelemetry({ type: 'dose_abort', siloId, reason, topUpN });
                            logger.warn('Customizer', `Dose aborted: ${reason}`);
                        },
                    },
                    { targetKg: doseTargetKg, siloId }
                );

                ctrl.tare(siloManager.getWeight()); // Tare before every specific dose/top-up

                // --- Calculate Scaled Recipe for Top-Up ---
                // If this is a top-up (N > 0), we must ONLY dispense the fraction missing.
                // scalingFactor = doseTargetKg / originalTargetKg
                // Example: Missing 2kg of 10kg target -> Scale = 0.2 (20%)
                const originalTargetKg = targetKg; // The total goal

                // For initial dose (N=0), target is full amount, factor = 1.0
                // For top-up, doseTargetKg is the shortfall.
                const scalingFactor = doseTargetKg / originalTargetKg;

                logger.info('Customizer', `Preparing Dose #${topUpN}. Target=${doseTargetKg.toFixed(3)}kg. Scaling Factor=${scalingFactor.toFixed(4)}`);

                // Create scaled ingredients list
                const scaledIngredients = ingredients.map(ing => ({
                    ...ing,
                    value: Math.max(0, ing.value * scalingFactor)
                }));

                scaledIngredients.forEach(i =>
                    logger.info('Customizer', `  -> Scaled Ing ${i.ingredientId}: ${i.value.toFixed(2)} (Orig: ${ingredients.find(x => x.ingredientId === i.ingredientId)?.value})`)
                );

                await connection.sendCustomOrder({
                    menuId: drink.id,
                    cups: 1,
                    cupSize: -1,
                    ingredients: scaledIngredients,
                });

                ctrl.start(() => { connection.cancelOrder(); });
                siloManager.sendTelemetry({
                    type: 'dose_start', siloId,
                    targetKg: doseTargetKg, tareKg: siloManager.getWeight(), topUpN,
                });
                setDoseController(ctrl);
            };

            try {
                onBrewingStart();
                await runDose(targetKg, 0); // Initial dose: target = full amount
            } catch (err) {
                logger.error('Customizer', 'Failed to start gravimetric brew', err);
            }
        } else {
            // --- Standard (non-gravimetric) brew ---
            // If "ml" = "kg", then this mode might send weird values to a normal machine, 
            // but for SiloOS we assume gravimetric is primary.
            const sendCupSize = (customVolume === details.globalNom) ? -1 : customVolume;

            onBrewingStart();
            await connection.sendCustomOrder({
                menuId: drink.id,
                cups: 1,
                cupSize: sendCupSize,
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

    // Recipe unit from first ingredient
    const recipeUnit = details.ingredients[0]?.variants[0]?.unit || 'ml';
    // Slider step: fine for small ranges, coarse for large
    const sliderRange = (details.globalMax || 500) - (details.globalMin || 10);
    const sliderStep = sliderRange > 100 ? 1 : sliderRange > 10 ? 0.5 : 0.1;

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
                            {customVolume} {recipeUnit}
                            {isGravimetric && (
                                <span className="text-amber-500"> ({customVolume.toFixed(3)} kg)</span>
                            )}
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
                        <span>Gravimetric Dosing (Scale Auto-Stop)</span>
                    </label>

                    <div className="ingredient-grid">
                        {/* Drink Size — one slider, same for both modes */}
                        <div className="ingredient-group">
                            <span className="ingredient-title text-amber-500">
                                {isGravimetric ? 'Target Weight' : 'Drink Size'}
                            </span>
                            <Slider
                                label={isGravimetric ? 'Target' : 'Size'}
                                unit={recipeUnit}
                                min={details.globalMin || 10}
                                max={details.globalMax || 500}
                                step={sliderStep}
                                value={customVolume}
                                onChange={(v) => setCustomVolume(v)}
                            />
                            {isGravimetric && (
                                <div className="gravimetric-kg-readout">
                                    = {customVolume.toFixed(3)} kg
                                </div>
                            )}
                        </div>

                        {/* Ingredient sliders from recipe */}
                        {details.ingredients.map(ing => (
                            <div key={ing.id} className="ingredient-group">
                                <div className="ingredient-title">
                                    {ing.variants[0]?.name || `Ingredient ${ing.id}`}
                                </div>
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
                                                step={variant.max > 10 ? 1 : 0.1}
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
