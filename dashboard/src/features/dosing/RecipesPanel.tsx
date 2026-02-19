import React, { useState, useEffect } from 'react';
import type { Recipe } from './Recipe';
import { SiloManager } from '../../bluetooth/SiloManager';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { RecipeEditor } from './RecipeEditor';
import { RecipeRunner, type RecipeUpdate } from './RecipeRunner';
import { logger } from '../../utils/logger';

interface RecipesPanelProps {
    siloManager: SiloManager;
}

export const RecipesPanel: React.FC<RecipesPanelProps> = ({ siloManager }) => {
    const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | undefined>();
    const [activeRunner, setActiveRunner] = useState<RecipeRunner | null>(null);
    const [runnerUpdate, setRunnerUpdate] = useState<RecipeUpdate | null>(null);

    useEffect(() => {
        // Initial sync
        setRecipes(siloManager.getRecipes());

        // Listen for updates from other clients/Pi
        const handleRecipesChange = (newRecipes: Record<string, Recipe>) => {
            setRecipes(newRecipes);
        };
        siloManager.addRecipesListener(handleRecipesChange);

        return () => {
            siloManager.removeRecipesListener(handleRecipesChange);
        };
    }, [siloManager]);

    // Handle runner events
    useEffect(() => {
        if (!activeRunner) return;

        activeRunner.events.onUpdate = (u) => setRunnerUpdate({ ...u });
        activeRunner.events.onComplete = () => {
            setTimeout(() => {
                setActiveRunner(null);
                setRunnerUpdate(null);
            }, 3000);
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

    const handleSaveRecipe = (recipe: Recipe) => {
        const newRecipes = { ...recipes, [recipe.id]: recipe };
        siloManager.updateRecipes(newRecipes);
        setIsEditing(false);
        setEditingRecipe(undefined);
    };

    const handleDeleteRecipe = (id: string) => {
        const newRecipes = { ...recipes };
        delete newRecipes[id];
        siloManager.updateRecipes(newRecipes);
    };

    const handleRunRecipe = (recipe: Recipe) => {
        if (activeRunner) return;

        const runner = new RecipeRunner(recipe, siloManager);
        setActiveRunner(runner);
        runner.start();

        // Relay weight updates to the runner
        const weightHandler = (w: number) => {
            runner.onWeight(w);
        };
        siloManager.addStatusListener((connected) => {
            if (!connected) runner.abort('Machine disconnected');
        });

        // This is a simplified way to relay weights - in a full app we'd use SiloManager events
        const originalOnWeight = siloManager.events.onWeightUpdate;
        siloManager.events.onWeightUpdate = (w) => {
            originalOnWeight?.(w);
            runner.onWeight(w);
        };
    };

    if (isEditing) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <RecipeEditor
                    initialRecipe={editingRecipe}
                    onSave={handleSaveRecipe}
                    onCancel={() => { setIsEditing(false); setEditingRecipe(undefined); }}
                />
            </div>
        );
    }

    if (activeRunner && runnerUpdate) {
        return (
            <Card className="p-6 bg-zinc-900 border-amber/20 mb-6">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-amber uppercase tracking-widest">
                            Executing Recipe
                        </h3>
                        <p className="text-sm text-zinc-400 font-mono mt-1">{runnerUpdate.recipe.name}</p>
                    </div>
                    <Button variant="secondary" className="!bg-red-900/20 text-red-500 border-red-900/40" onClick={() => activeRunner.abort()}>
                        ABORT SEQUENCE
                    </Button>
                </div>

                <div className="space-y-6">
                    {/* Total Progress */}
                    <div>
                        <div className="flex justify-between text-xs font-mono mb-2">
                            <span className="text-zinc-500 uppercase">Overall Progress</span>
                            <span className="text-amber">{(runnerUpdate.totalProgress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber transition-all duration-500"
                                style={{ width: `${runnerUpdate.totalProgress * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Step Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                            <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Current Step</div>
                            <div className="text-lg font-bold">
                                {runnerUpdate.currentStepIndex + 1} / {runnerUpdate.recipe.steps.length}
                            </div>
                            <div className="text-xs text-amber font-mono">
                                Silo {runnerUpdate.recipe.steps[runnerUpdate.currentStepIndex]?.siloId}
                            </div>
                        </div>
                        <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                            <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Dispensed</div>
                            <div className="text-lg font-bold">
                                {runnerUpdate.currentStepUpdate?.dispensedKg.toFixed(2) || '0.00'}
                                <span className="text-xs text-zinc-500 ml-1">kg</span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono">
                                Target: {runnerUpdate.currentStepUpdate?.targetKg.toFixed(2) || '0.00'} kg
                            </div>
                        </div>
                    </div>

                    <div className="text-center py-2">
                        <span className="text-xs font-mono animate-pulse text-amber uppercase tracking-widest">
                            {runnerUpdate.state === 'done' ? 'Sequence Complete' : 'Sequence Running...'}
                        </span>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <div className="recipes-panel mt-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                    Custom Mix Recipes
                </h3>
                <Button variant="secondary" className="text-[10px] !py-1 !px-3" onClick={() => setIsEditing(true)}>
                    + CREATE NEW
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(recipes).length === 0 && (
                    <div className="col-span-full py-8 text-center bg-zinc-900/30 rounded border border-dashed border-zinc-800">
                        <p className="text-zinc-600 font-mono text-xs italic">No custom recipes found. Create your first mix sequence.</p>
                    </div>
                )}
                {Object.values(recipes).map(recipe => (
                    <Card key={recipe.id} className="p-4 bg-zinc-900/50 hover:border-amber/30 transition-all group">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-amber">{recipe.name}</h4>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="text-zinc-500 hover:text-white" onClick={() => { setEditingRecipe(recipe); setIsEditing(true); }}>
                                    <span className="text-xs uppercase font-mono">Edit</span>
                                </button>
                                <button className="text-zinc-500 hover:text-red-500" onClick={() => handleDeleteRecipe(recipe.id)}>
                                    <span className="text-xs uppercase font-mono">Del</span>
                                </button>
                            </div>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mb-4 h-12 overflow-hidden">
                            {recipe.steps.map((s, i) => (
                                <span key={i} className="inline-block bg-zinc-800 px-1.5 py-0.5 rounded mr-1 mb-1">
                                    S{s.siloId}: {s.targetKg}kg
                                </span>
                            ))}
                        </div>
                        <Button
                            className="w-full text-xs font-mono tracking-widest py-2 bg-amber/10 border-amber/20 text-amber hover:bg-amber hover:text-black"
                            onClick={() => handleRunRecipe(recipe)}
                        >
                            RUN SEQUENCE
                        </Button>
                    </Card>
                ))}
            </div>
        </div>
    );
};
