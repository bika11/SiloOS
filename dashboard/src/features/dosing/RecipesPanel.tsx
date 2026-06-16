import React, { useState, useEffect, useRef } from 'react';
import type { Recipe, RecipeStep } from './Recipe';
import type { ParsedMenuItem } from '../../entities/Menu';
import { SiloManager } from '../../bluetooth/SiloManager';
import { TopBrewerConnection } from '../../bluetooth/TopBrewerConnection';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { RecipeEditor } from './RecipeEditor';
import { RecipeRunner, type RecipeUpdate } from './RecipeRunner';
import { SiloInventory } from '../settings/SiloInventory';
import { logger } from '../../utils/logger';

interface RecipesPanelProps {
    siloManager: SiloManager;
    connection: TopBrewerConnection | null;
    menuItems: ParsedMenuItem[];
}

export const RecipesPanel: React.FC<RecipesPanelProps> = ({
    siloManager,
    connection,
    menuItems
}) => {
    const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | undefined>();
    const [activeRunner, setActiveRunner] = useState<RecipeRunner | null>(null);
    const [runnerUpdate, setRunnerUpdate] = useState<RecipeUpdate | null>(null);

    // Sync recipes from Pi and listen for global aborts
    useEffect(() => {
        setRecipes(siloManager.getRecipes());

        const handleRecipesChange = (newRecipes: Record<string, Recipe>): void => {
            setRecipes(newRecipes);
        };
        const handleGlobalAbort = (reason: string) => {
            if (activeRunnerRef.current) {
                logger.warn('RecipesPanel', `Global abort received: ${reason}`);
                activeRunnerRef.current.abort(reason);
            }
        };

        siloManager.addRecipesListener(handleRecipesChange);

        // Add global abort listener to events object safely
        const prevAbort = siloManager['events']?.onGlobalAbort;
        siloManager['events'] = {
            ...siloManager['events'],
            onGlobalAbort: (reason) => {
                handleGlobalAbort(reason);
                prevAbort?.(reason);
            }
        };

        return () => {
            siloManager.removeRecipesListener(handleRecipesChange);
            if (siloManager['events']) {
                siloManager['events'].onGlobalAbort = prevAbort;
            }
        };
    }, [siloManager]);

    // Keep a ref to the active runner so the effect above can access the latest one without re-binding
    const activeRunnerRef = useRef<RecipeRunner | null>(null);
    useEffect(() => {
        activeRunnerRef.current = activeRunner;
    }, [activeRunner]);

    // Wire runner events
    useEffect(() => {
        if (!activeRunner) return;

        activeRunner.events.onUpdate = (u: RecipeUpdate) => setRunnerUpdate({ ...u });
        activeRunner.events.onComplete = () => {
            setTimeout(() => {
                setActiveRunner(null);
                setRunnerUpdate(null);
            }, 5000);
        };
        activeRunner.events.onAbort = () => {
            setTimeout(() => {
                setActiveRunner(null);
                setRunnerUpdate(null);
            }, 3000);
        };

        return () => {
            activeRunner.events.onUpdate = undefined;
            activeRunner.events.onComplete = undefined;
            activeRunner.events.onAbort = undefined;
        };
    }, [activeRunner]);

    const handleSaveRecipe = (recipe: Recipe): void => {
        const newRecipes = { ...recipes, [recipe.id]: recipe };
        siloManager.updateRecipes(newRecipes);
        setRecipes(newRecipes); // Optimistic local update
        setIsEditing(false);
        setEditingRecipe(undefined);
    };

    const handleDeleteRecipe = (id: string): void => {
        const newRecipes = { ...recipes };
        delete newRecipes[id];
        siloManager.updateRecipes(newRecipes);
        setRecipes(newRecipes);
    };

    const handleRunRecipe = (recipe: Recipe): void => {
        if (activeRunner || !connection) return;

        const runner = new RecipeRunner(recipe, siloManager, connection);
        setActiveRunner(runner);
        runner.start();
    };

    // --- Editor Overlay ---
    if (isEditing) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <RecipeEditor
                    initialRecipe={editingRecipe}
                    menuItems={menuItems}
                    onSave={handleSaveRecipe}
                    onCancel={() => { setIsEditing(false); setEditingRecipe(undefined); }}
                />
            </div>
        );
    }

    // --- Active Execution Overlay ---
    if (activeRunner && runnerUpdate) {
        const currentStep = runnerUpdate.recipe.steps[runnerUpdate.currentStepIndex];
        const isDone = runnerUpdate.state === 'done';
        const isAborted = runnerUpdate.state === 'aborted';
        const isSettling = runnerUpdate.state === 'settling';
        const isFinished = isDone || isAborted;

        return (
            <Card className="p-6 bg-zinc-900 border-amber/20 mt-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">
                            {isDone ? 'Sequence Complete' : isAborted ? 'Sequence Aborted' : 'Executing Blend'}
                        </h3>
                        <p className="text-lg font-bold text-amber font-mono">{runnerUpdate.recipe.name}</p>
                    </div>
                    {!isFinished && (
                        <Button
                            variant="secondary"
                            className="!bg-red-900/20 !text-red-500 !border-red-900/40 text-xs"
                            onClick={() => activeRunner.abort()}
                        >
                            ABORT
                        </Button>
                    )}
                    {isFinished && (
                        <Button
                            variant="secondary"
                            className="text-xs"
                            onClick={() => { setActiveRunner(null); setRunnerUpdate(null); }}
                        >
                            DISMISS
                        </Button>
                    )}
                </div>

                {/* Total Progress Bar */}
                <div className="mb-6">
                    <div className="flex justify-between text-[10px] font-mono mb-2">
                        <span className="text-zinc-500 uppercase">Total Progress</span>
                        <span className="text-amber">{(runnerUpdate.totalProgress * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-green-500' : isAborted ? 'bg-red-500' : 'bg-amber'}`}
                            style={{ width: `${runnerUpdate.totalProgress * 100}%` }}
                        />
                    </div>
                </div>

                {/* Step Cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    {/* Current Step */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                        <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Step</div>
                        <div className="text-lg font-bold font-mono">
                            {Math.min(runnerUpdate.currentStepIndex + 1, runnerUpdate.recipe.steps.length)} / {runnerUpdate.recipe.steps.length}
                        </div>
                        <div className="text-xs text-amber font-mono truncate">
                            {currentStep?.menuName || '—'}
                        </div>
                    </div>

                    {/* Dispensed */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                        <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Dispensed</div>
                        <div className="text-lg font-bold font-mono">
                            {runnerUpdate.currentStepUpdate?.dispensedKg.toFixed(2) || '0.00'}
                            <span className="text-xs text-zinc-500 ml-1">kg</span>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">
                            / {runnerUpdate.currentStepUpdate?.targetKg.toFixed(2) || '0.00'} kg
                        </div>
                    </div>

                    {/* Cumulative Total */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                        <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Total</div>
                        <div className="text-lg font-bold font-mono">
                            {runnerUpdate.cumulativeKg.toFixed(2)}
                            <span className="text-xs text-zinc-500 ml-1">kg</span>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">
                            / {runnerUpdate.totalTargetKg.toFixed(2)} kg
                        </div>
                    </div>
                </div>

                {/* Status Line */}
                <div className="text-center py-2">
                    <span className={`text-xs font-mono uppercase tracking-widest ${isFinished ? '' : 'animate-pulse'} ${isDone ? 'text-green-500' : isAborted ? 'text-red-500' : isSettling ? 'text-blue-400' : 'text-amber'}`}>
                        {isDone ? '✓ Blend Complete' : isAborted ? '✕ Aborted' : isSettling ? 'Settling — switching silo...' : 'Dispensing...'}
                    </span>
                </div>
            </Card>
        );
    }

    // --- Recipe List ---
    return (
        <div className="mt-6">
            <SiloInventory
                siloManager={siloManager}
                activeSilos={Object.keys(siloManager.getProfiles())}
            />

            <div className="flex justify-between items-center mb-4 mt-8">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                    Custom Blends
                </h3>
                <Button
                    variant="secondary"
                    className="text-[10px] !py-1 !px-3"
                    onClick={() => setIsEditing(true)}
                    disabled={menuItems.length === 0}
                >
                    + NEW BLEND
                </Button>
            </div>

            {menuItems.length === 0 && (
                <div className="py-6 text-center bg-zinc-900/30 rounded border border-dashed border-zinc-800">
                    <p className="text-zinc-600 font-mono text-xs italic">
                        Connect to machine to create blends from the drink menu.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(recipes).length === 0 && menuItems.length > 0 && (
                    <div className="col-span-full py-8 text-center bg-zinc-900/30 rounded border border-dashed border-zinc-800">
                        <p className="text-zinc-600 font-mono text-xs italic">
                            No blends yet. Create your first custom mix sequence.
                        </p>
                    </div>
                )}
                {Object.values(recipes).map((recipe: Recipe) => {
                    const totalKg = recipe.steps.reduce((sum: number, s: RecipeStep) => sum + s.targetKg, 0);
                    return (
                        <Card key={recipe.id} className="p-4 bg-zinc-900/50 hover:border-amber/30 transition-all group">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-amber font-mono">{recipe.name}</h4>
                                <div className="flex gap-2">
                                    <button
                                        className="text-zinc-500 hover:text-white transition-colors"
                                        onClick={() => { setEditingRecipe(recipe); setIsEditing(true); }}
                                        aria-label={`Edit ${recipe.name}`}
                                    >
                                        <span className="text-[10px] uppercase font-mono">Edit</span>
                                    </button>
                                    <button
                                        className="text-zinc-500 hover:text-red-500 transition-colors"
                                        onClick={() => {
                                            if (window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) {
                                                handleDeleteRecipe(recipe.id);
                                            }
                                        }}
                                        aria-label={`Delete ${recipe.name}`}
                                    >
                                        <span className="text-[10px] uppercase font-mono">Del</span>
                                    </button>
                                </div>
                            </div>

                            {/* Step pills */}
                            <div className="text-[10px] font-mono text-zinc-500 mb-3 min-h-[2rem]">
                                {recipe.steps.map((s: RecipeStep, i: number) => (
                                    <span key={i} className="inline-block bg-zinc-800 px-1.5 py-0.5 rounded mr-1 mb-1">
                                        {s.menuName}: {s.targetKg}kg
                                    </span>
                                ))}
                            </div>

                            {/* Total weight */}
                            <div className="text-xs font-mono text-zinc-400 mb-3">
                                Total: <span className="text-amber font-bold">{totalKg.toFixed(1)} kg</span>
                            </div>

                            <Button
                                className="w-full text-xs font-mono tracking-widest py-2 !bg-amber/10 !border-amber/20 !text-amber hover:!bg-amber hover:!text-black transition-all"
                                onClick={() => handleRunRecipe(recipe)}
                                disabled={!connection || !!activeRunner}
                            >
                                {!connection ? 'OFFLINE' : 'RUN SEQUENCE'}
                            </Button>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};
