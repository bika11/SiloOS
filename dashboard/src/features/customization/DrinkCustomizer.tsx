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
import { Stepper } from '../../components/ui/Stepper';
import { ScaleLoadingScreen } from '../scale/ScaleLoadingScreen';
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
    const [isSynchronizing, setIsSynchronizing] = useState(true);
    const [customValues, setCustomValues] = useState<Record<string, number>>({});
    const [customVolume, setCustomVolume] = useState<number>(0);
    const [isGravimetric, setIsGravimetric] = useState(true); // GLOVE RULE: Default to true
    const [doseController, setDoseController] = useState<DoseController | null>(null);
    const [cups, setCups] = useState(1);

    const activeDoseRef = useRef<DoseController | null>(null);
    // FIX 2: Track which ingredient sliders the user actually touched.
    // Only modified ingredients are sent in the order — untouched ones are omitted
    // so the machine can apply its own proportional scaling from recipe_1.xml.
    const [modifiedIngredients, setModifiedIngredients] = useState<Set<string>>(new Set());

    // Persistence Keys
    const PREF_KEY_VOLUME = `vol_${drink.id}`;
    const PREF_KEY_VALS = `vals_${drink.id}`;

    useEffect(() => {
        const handleDetails = (data: MenuDetails) => {
            if (data.menuItemId === drink.id) {
                setDetails(data);

                // Pi-Side Persistence: Load from SiloManager instead of localStorage
                const prefs = siloManager.getPreferences();
                const savedVals = prefs[PREF_KEY_VALS];
                const savedVol = prefs[PREF_KEY_VOLUME];

                if (savedVals) {
                    setCustomValues(savedVals);
                    setModifiedIngredients(new Set(Object.keys(savedVals)));
                } else {
                    const initialValues: Record<string, number> = {};
                    data.ingredients.forEach(ing => {
                        ing.variants.forEach(variant => {
                            const key = `${ing.id}-${variant.id}`;
                            initialValues[key] = variant.defaultValue;
                        });
                    });
                    setCustomValues(initialValues);
                    setModifiedIngredients(new Set());
                }

                if (savedVol) {
                    setCustomVolume(parseFloat(savedVol));
                } else {
                    setCustomVolume(data.globalNom || 200);
                }

                setLoading(false);
                setTimeout(() => setIsSynchronizing(false), 1500);
            }
        };

        connection.events.onDrinkDetailsReceived = handleDetails;
        connection.requestDrinkDetails(drink.id).catch(() => setLoading(false));

        return () => { connection.events.onDrinkDetailsReceived = undefined; };
    }, [drink, connection, PREF_KEY_VALS, PREF_KEY_VOLUME, siloManager]);

    // Handle incoming updates from other clients
    useEffect(() => {
        const handlePrefUpdate = (prefs: any) => {
            const savedVals = prefs[PREF_KEY_VALS];
            const savedVol = prefs[PREF_KEY_VOLUME];

            if (savedVals) {
                setCustomValues(savedVals);
                setModifiedIngredients(new Set(Object.keys(savedVals)));
            }
            if (savedVol) {
                setCustomVolume(parseFloat(savedVol));
            }
        };

        siloManager.onPreferencesUpdate = handlePrefUpdate;
        return () => { if (siloManager.onPreferencesUpdate === handlePrefUpdate) siloManager.onPreferencesUpdate = undefined; };
    }, [siloManager, PREF_KEY_VALS, PREF_KEY_VOLUME]);

    // Save on every change via SiloManager
    useEffect(() => {
        if (Object.keys(customValues).length > 0) {
            siloManager.updatePreferences({ [PREF_KEY_VALS]: customValues });
        }
    }, [customValues, PREF_KEY_VALS, siloManager]);

    useEffect(() => {
        if (customVolume > 0) {
            siloManager.updatePreferences({ [PREF_KEY_VOLUME]: customVolume });
        }
    }, [customVolume, PREF_KEY_VOLUME, siloManager]);

    const handleValueChange = useCallback((ingId: number, varId: number, value: number) => {
        const key = `${ingId}-${varId}`;
        setCustomValues(prev => ({ ...prev, [key]: value }));
        setModifiedIngredients((prev: Set<string>) => new Set(prev).add(key));
    }, []);

    // Weight polling: read siloManager.getWeight() at 10 Hz and feed to
    // the active DoseController. This is far more reliable than monkey-patching
    // the private events object, which gets overwritten by other consumers.
    useEffect(() => {
        const POLL_MS = 100; // 10 Hz
        const id = setInterval(() => {
            if (activeDoseRef.current) {
                activeDoseRef.current.onWeight(siloManager.getWeight());
            }
        }, POLL_MS);
        return () => clearInterval(id);
    }, [siloManager]);

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

        if (isGravimetric) {
            // --- Precision Gravimetric Dosing ---
            // Strategy: Send enough cups so the machine keeps pouring continuously.
            // The DoseController monitors weight and sends cancelOrder() at the target.
            // This avoids the slow top-up loop (order → pour → stop → detect shortfall → re-order).
            const siloId = drink.name || `drink_${drink.id}`;
            // CRITICAL: 1 App Unit = 1 Physical Kg. No division by 1000.
            const targetKg = customVolume;
            const nominalKg = details.globalNom || 1;

            // Calculate how many cups to request so the machine doesn't run out
            // before we reach target weight. Add +2 buffer for safety.
            const gravCups = Math.min(255, Math.ceil(targetKg / nominalKg) + 2);

            const ctrl = new DoseController(
                {
                    onComplete: (result) => {
                        logger.info('Customizer', `Gravimetric done: ${result.actualKg.toFixed(3)}kg`);
                    },
                    onAbort: (reason) => {
                        logger.warn('Customizer', `Dose aborted: ${reason}`);
                    },
                },
                { targetKg, siloId },
                siloManager
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
            onBrewingStart();
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

    if (loading || isSynchronizing) {
        return (
            <ScaleLoadingScreen
                isStabilizing={isSynchronizing}
                currentWeight={siloManager.getWeight()}
                targetWeight={customVolume}
                connectionState={scaleManager.getState()}
                onCancel={onClose}
            />
        );
    }

    if (!details) {
        return (
            <div className="customizer-overlay text-amber uppercase font-mono bg-black/80 flex items-center justify-center">
                <div className="text-center p-8 glass rounded-xl border border-amber/20">
                    <p className="mb-4">Error: Recipe Data Missing</p>
                    <Button onClick={onClose}>Return</Button>
                </div>
            </div>
        );
    }

    const recipeUnit = details.ingredients[0]?.variants[0]?.unit || 'ml';
    const sliderMin = isGravimetric ? 0.1 : (details.globalMin || 10);
    const sliderMax = isGravimetric ? 120 : (details.globalMax || 500);
    const sliderStep = isGravimetric ? 0.1 : ((details.globalMax || 500) - (details.globalMin || 10)) > 100 ? 1 : 0.5;

    return (
        <div className="customizer-overlay">
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
                        <span className="total-volume text-mono text-amber">
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

                    <div className="flex items-center justify-between p-4 glass rounded-xl border border-zinc-800/50 mb-6">
                        <div className="flex flex-col">
                            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Dosing Mode</span>
                            <span className="font-mono text-sm text-amber font-bold">GRAVIMETRIC (AUTO-STOP)</span>
                        </div>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={isGravimetric}
                                onChange={(e) => setIsGravimetric(e.target.checked)}
                            />
                            <span className="switch-slider shadow-lg"></span>
                        </label>
                    </div>

                    <div className="ingredient-grid">
                        {details.carafe && !isGravimetric && (
                            <div className="ingredient-group">
                                <span className="text-mono text-amber font-bold uppercase tracking-wider mb-2 block">Cups</span>
                                <div className="cup-selector flex gap-2">
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <button
                                            key={n}
                                            className={`flex-1 btn ${cups === n ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setCups(n)}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="ingredient-group">
                            <span className="text-mono text-amber font-bold uppercase tracking-wider mb-2 block">
                                {isGravimetric ? 'TARGET WEIGHT' : 'DRINK SIZE'}
                            </span>
                            <Stepper
                                label={isGravimetric ? 'TARGET' : 'SIZE'}
                                unit={isGravimetric ? 'kg' : recipeUnit}
                                min={sliderMin}
                                max={sliderMax}
                                step={sliderStep}
                                value={customVolume}
                                onChange={(v) => setCustomVolume(v)}
                            />
                        </div>

                        {details.ingredients.map(ing => (
                            <div key={ing.id} className="ingredient-group">
                                <span className="text-mono text-amber font-bold uppercase tracking-wider mb-2 block">
                                    {ing.variants[0]?.name || `INGREDIENT ${ing.id}`}
                                </span>
                                {ing.variants.map(variant => {
                                    const key = `${ing.id}-${variant.id}`;
                                    const val = customValues[key];
                                    return (
                                        <div key={variant.id} className="variant-row">
                                            <Stepper
                                                label={variant.name || `VAR ${variant.id}`}
                                                unit={variant.unit}
                                                min={variant.min}
                                                max={variant.max}
                                                step={variant.max > 10 ? 1 : 0.1}
                                                value={val}
                                                onChange={(v) => handleValueChange(ing.id, variant.id, v)}
                                                decimalPlaces={variant.max > 10 ? 0 : 1}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="customizer-actions flex gap-4 p-4 border-t border-zinc-800">
                    <Button variant="secondary" onClick={onClose} className="flex-1 h-16">Back</Button>
                    <Button
                        variant="primary"
                        onClick={handleBrew}
                        className="brew-btn flex-[2] h-16"
                    >
                        START BREWING{cups > 1 ? ` (${cups} cups)` : ''}
                    </Button>
                </div>
            </Card>
        </div>
    );
};
