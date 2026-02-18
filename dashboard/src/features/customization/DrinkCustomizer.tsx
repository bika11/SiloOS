import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    const [cups, setCups] = useState(1);

    // FIX 1: Synchronous ref for active DoseController — avoids React state race on top-ups.
    // React's setDoseController is async; the weight-listener effect won't re-run until
    // the next render.  The ref updates immediately so a new top-up controller receives
    // weight samples from the moment it's created.
    const activeDoseRef = useRef<DoseController | null>(null);

    // FIX 2: Track which ingredient sliders the user actually touched.
    // Only modified ingredients are sent in the order — untouched ones are omitted
    // so the machine can apply its own proportional scaling from recipe_1.xml.
    const [modifiedIngredients, setModifiedIngredients] = useState<Set<string>>(new Set());

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
                setModifiedIngredients(new Set());

                logger.info('Customizer',
                    `Recipe loaded: "${data.name}" min=${data.globalMin} nom=${data.globalNom} max=${data.globalMax} ` +
                    `carafe=${data.carafe} ingredients=${data.ingredients.length}`
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

    // Weight polling: read siloManager.getWeight() at 10 Hz and feed to
    // the active DoseController.  This is far more reliable than monkey-patching
    // the private `events` object, which gets overwritten by other consumers.
    useEffect(() => {
        const POLL_MS = 100; // 10 Hz
        const id = setInterval(() => {
            if (activeDoseRef.current) {
                activeDoseRef.current.onWeight(siloManager.getWeight());
            }
        }, POLL_MS);
        return () => clearInterval(id);
    }, [siloManager]);

    const handleValueChange = useCallback((ingId: number, varId: number, value: number) => {
        const key = `${ingId}-${varId}`;
        setCustomValues(prev => ({ ...prev, [key]: value }));
        setModifiedIngredients((prev: Set<string>) => new Set(prev).add(key));
    }, []);

    const handleBrew = async () => {
        if (!details) return;

        // FIX 2: Only include ingredients the user actually changed from defaults.
        // Untouched ingredients are omitted so the machine applies its own
        // proportional scaling (CUP_SIZE ratio * internal nominal values).
        const changedIngredients: OrderIngredient[] = [];
        details.ingredients.forEach(ing => {
            ing.variants.forEach(variant => {
                const key = `${ing.id}-${variant.id}`;
                if (modifiedIngredients.has(key)) {
                    changedIngredients.push({
                        ingredientId: ing.id,
                        variantId: variant.id,
                        value: customValues[key] ?? variant.defaultValue,
                    });
                }
            });
        });

        // FIX 2: CUP_SIZE — send explicit size whenever it differs from nominal.
        // The machine uses CUP_SIZE / Nominal as a multiplier for proportional scaling.
        // -1 means "use machine default".
        const sendCupSize = (customVolume === details.globalNom) ? -1 : customVolume;

        logger.info('Customizer',
            `Order: menuId=${drink.id} cups=${cups} cupSize=${sendCupSize} ` +
            `gravimetric=${isGravimetric} customVolume=${customVolume} globalNom=${details.globalNom} ` +
            `changedIngredients=${changedIngredients.length}/${details.ingredients.length}`
        );
        changedIngredients.forEach(i =>
            logger.info('Customizer', `  changed ing=${i.ingredientId} var=${i.variantId} val=${i.value}`)
        );

        if (isGravimetric) {
            // --- Precision Gravimetric Dosing ---
            // Strategy: Send enough cups so the machine keeps pouring continuously.
            // The DoseController monitors weight and sends cancelOrder() at the target.
            // This avoids the slow top-up loop (order → pour → stop → detect shortfall → re-order).
            const siloId = drink.name || `drink_${drink.id}`;

            // CRITICAL: 1 App Unit = 1 Physical Kg. No division by 1000.
            const targetKg = customVolume;

            // Calculate how many cups to request so the machine doesn't run out
            // before we reach target weight. Add +2 buffer for safety.
            const nominalKg = details.globalNom || 1;
            const gravCups = Math.min(255, Math.ceil(targetKg / nominalKg) + 2);

            logger.info('Customizer',
                `Gravimetric: target=${targetKg.toFixed(1)}kg nominal=${nominalKg}kg/cup → requesting ${gravCups} cups`
            );

            const ctrl = new DoseController(
                {
                    onComplete: (result) => {
                        logger.info('Customizer',
                            `Gravimetric done: ${result.actualKg.toFixed(3)}kg / ${result.targetKg.toFixed(3)}kg ` +
                            `overshoot=${result.overshootKg.toFixed(3)}kg`
                        );
                    },
                    onAbort: (reason) => {
                        logger.warn('Customizer', `Dose aborted: ${reason}`);
                    },
                },
                { targetKg, siloId }
            );

            ctrl.tare(siloManager.getWeight());

            // Send cupSize=-1 so machine uses its default recipe per cycle.
            // The cup count ensures it keeps pouring; DoseController handles the stop.
            await connection.sendCustomOrder({
                menuId: drink.id,
                cups: gravCups,
                cupSize: -1,
                ingredients: changedIngredients,
            });

            activeDoseRef.current = ctrl;
            ctrl.start(() => { connection.cancelOrder(); });
            setDoseController(ctrl);

            try {
                onBrewingStart();
            } catch (err) {
                logger.error('Customizer', 'Failed to start gravimetric brew', err);
            }
        } else {
            // --- Standard (non-gravimetric) brew ---
            // Machine handles proportional scaling via CUP_SIZE / Nominal ratio.
            // Only user-modified ingredients are sent; the rest use machine defaults.
            onBrewingStart();
            await connection.sendCustomOrder({
                menuId: drink.id,
                cups,
                cupSize: sendCupSize,
                ingredients: changedIngredients,
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
    // Slider config: gravimetric uses fixed 0-120kg @ 0.1 step; standard uses machine recipe range
    const sliderMin = isGravimetric ? 0.1 : (details.globalMin || 10);
    const sliderMax = isGravimetric ? 120 : (details.globalMax || 500);
    const sliderStep = isGravimetric ? 0.1 : ((details.globalMax || 500) - (details.globalMin || 10)) > 100 ? 1 : 0.5;

    return (
        <div className="customizer-overlay">
            {/* Brew Monitor Overlay (gravimetric mode) */}
            {doseController && (
                <BrewMonitor
                    controller={doseController}
                    onClose={() => {
                        activeDoseRef.current = null;
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
                            {isGravimetric
                                ? `${customVolume.toFixed(1)} kg`
                                : `${customVolume} ${recipeUnit}`
                            }
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
                        {/* FIX 3: Cup Count — shown only for carafe-capable drinks */}
                        {details.carafe && !isGravimetric && (
                            <div className="ingredient-group">
                                <span className="ingredient-title text-amber-500">Cups</span>
                                <div className="cup-selector">
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <button
                                            key={n}
                                            className={`cup-btn ${cups === n ? 'active' : ''}`}
                                            onClick={() => setCups(n)}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Drink Size — one slider, same for both modes */}
                        <div className="ingredient-group">
                            <span className="ingredient-title text-amber-500">
                                {isGravimetric ? 'Target Weight' : 'Drink Size'}
                            </span>
                            <Slider
                                label={isGravimetric ? 'Target' : 'Size'}
                                unit={isGravimetric ? 'kg' : recipeUnit}
                                min={sliderMin}
                                max={sliderMax}
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
                        START BREWING{cups > 1 ? ` (${cups} cups)` : ''}
                    </Button>
                </div>
            </Card>
        </div>
    );
};
