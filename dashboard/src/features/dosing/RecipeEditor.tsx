import React, { useState, type ChangeEvent } from 'react';
import type { Recipe, RecipeStep } from './Recipe';
import { Button } from '../../components/ui/Button';
import { logger } from '../../utils/logger';

interface RecipeEditorProps {
    onSave: (recipe: Recipe) => void;
    onCancel: () => void;
    initialRecipe?: Recipe;
}

export const RecipeEditor: React.FC<RecipeEditorProps> = ({ onSave, onCancel, initialRecipe }) => {
    const [name, setName] = useState<string>(initialRecipe?.name || '');
    const [steps, setSteps] = useState<RecipeStep[]>(initialRecipe?.steps || [
        { siloId: '1', targetKg: 10 }
    ]);

    const addStep = () => {
        setSteps([...steps, { siloId: '1', targetKg: 5 }]);
    };

    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index));
    };

    const updateStep = (index: number, field: keyof RecipeStep, value: string | number) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], [field]: value } as RecipeStep;
        setSteps(newSteps);
    };

    const handleSave = () => {
        if (!name.trim()) {
            alert('Recipe name is required');
            return;
        }
        if (steps.length === 0) {
            alert('At least one step is required');
            return;
        }

        const recipe: Recipe = {
            id: initialRecipe?.id || Math.random().toString(36).substring(2, 9),
            name,
            steps: steps.map(s => ({ ...s, targetKg: Number(s.targetKg) })),
        };

        logger.info('RecipeEditor', `Saving recipe: ${recipe.name}`);
        onSave(recipe);
    };

    return (
        <div className="recipe-editor">
            <h3 className="text-xl font-bold mb-4">{initialRecipe ? 'Edit Recipe' : 'New Recipe'}</h3>

            <div className="form-group mb-6">
                <label className="block text-sm text-zinc-400 mb-2 uppercase tracking-wider">Recipe Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    placeholder="e.g., Morning Mix"
                    className="w-full bg-zinc-900 border border-zinc-700 px-4 py-2 rounded focus:border-amber outline-none transition-colors text-white"
                />
            </div>

            <div className="steps-container">
                <label className="block text-sm text-zinc-400 mb-2 uppercase tracking-wider font-mono">Sequence Steps</label>
                <div className="space-y-3 mb-6">
                    {steps.map((step, index) => (
                        <div key={index} className="recipe-step-edit flex items-center gap-3 bg-zinc-900/50 p-3 rounded border border-zinc-800">
                            <span className="step-number bg-zinc-800 w-8 h-8 flex items-center justify-center rounded-full text-xs font-mono text-amber">
                                {index + 1}
                            </span>
                            <div className="step-fields flex flex-1 items-center gap-4">
                                <select
                                    value={step.siloId}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => updateStep(index, 'siloId', e.target.value)}
                                    className="bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-sm focus:border-amber outline-none text-white"
                                >
                                    <option value="1">Silo 1</option>
                                    <option value="2">Silo 2</option>
                                    <option value="3">Silo 3</option>
                                    <option value="4">Silo 4</option>
                                </select>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={step.targetKg}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateStep(index, 'targetKg', parseFloat(e.target.value))}
                                        step="0.1"
                                        min="0.1"
                                        className="w-20 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-sm focus:border-amber outline-none text-right font-mono text-white"
                                    />
                                    <span className="text-xs text-zinc-500 uppercase">kg</span>
                                </div>
                            </div>
                            <Button
                                variant="secondary"
                                className="!px-3 !py-1 text-xs hover:bg-red-900/20 hover:text-red-500 transition-all"
                                onClick={() => removeStep(index)}
                            >
                                REMOVE
                            </Button>
                        </div>
                    ))}
                </div>
                <Button
                    variant="secondary"
                    className="w-full border-dashed border-zinc-700 hover:border-amber text-zinc-500 hover:text-amber py-3"
                    onClick={addStep}
                >
                    + ADD STEP
                </Button>
            </div>

            <div className="editor-actions flex justify-end gap-3 mt-8 pt-6 border-t border-zinc-800">
                <Button
                    variant="secondary"
                    onClick={onCancel}
                >
                    CANCEL
                </Button>
                <Button
                    onClick={handleSave}
                    className="bg-amber text-black hover:bg-amber/90"
                >
                    SAVE RECIPE
                </Button>
            </div>
        </div>
    );
};
