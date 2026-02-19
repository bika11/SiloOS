import React, { useState } from 'react';
import type { Recipe, RecipeStep } from './Recipe';
import type { ParsedMenuItem } from '../../entities/Menu';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Stepper } from '../../components/ui/Stepper';
import { logger } from '../../utils/logger';

interface RecipeEditorProps {
    onSave: (recipe: Recipe) => void;
    onCancel: () => void;
    menuItems: ParsedMenuItem[];
    initialRecipe?: Recipe;
}

export const RecipeEditor: React.FC<RecipeEditorProps> = ({
    onSave,
    onCancel,
    menuItems,
    initialRecipe
}) => {
    const [name, setName] = useState<string>(initialRecipe?.name || '');
    const defaultMenuItem = menuItems[0];
    const [steps, setSteps] = useState<RecipeStep[]>(initialRecipe?.steps || [
        { menuId: defaultMenuItem?.id || 0, menuName: defaultMenuItem?.name || 'Unknown', targetKg: 10 }
    ]);

    const addStep = (): void => {
        const item = menuItems[0];
        if (!item) return;
        setSteps([...steps, { menuId: item.id, menuName: item.name, targetKg: 5 }]);
    };

    const removeStep = (index: number): void => {
        setSteps(steps.filter((_: RecipeStep, i: number) => i !== index));
    };

    const updateStepMenu = (index: number, menuId: number): void => {
        const item = menuItems.find((m: ParsedMenuItem) => m.id === menuId);
        if (!item) return;
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], menuId: item.id, menuName: item.name };
        setSteps(newSteps);
    };

    const updateStepWeight = (index: number, targetKg: number): void => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], targetKg };
        setSteps(newSteps);
    };

    const totalKg = steps.reduce((sum: number, s: RecipeStep) => sum + s.targetKg, 0);

    const handleSave = (): void => {
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
            steps,
        };

        logger.info('RecipeEditor', `Saving recipe: ${recipe.name} (${steps.length} steps, ${totalKg}kg total)`);
        onSave(recipe);
    };

    return (
        <Card className="w-full max-w-lg p-6 bg-zinc-900 border-zinc-800">
            <h3 className="text-xl font-bold text-amber uppercase tracking-widest mb-6 font-mono">
                {initialRecipe ? 'Edit Blend' : 'New Blend'}
            </h3>

            {/* Recipe Name */}
            <div className="mb-6">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-2">
                    Blend Name
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    placeholder="e.g., Morning Blend"
                    className="w-full bg-zinc-800 border border-zinc-700 px-4 py-3 rounded font-mono text-sm focus:border-amber outline-none transition-colors text-white"
                />
            </div>

            {/* Total Weight Display */}
            <div className="flex items-center justify-between px-4 py-3 mb-6 bg-zinc-800/50 rounded border border-zinc-700">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                    Total Blend Weight
                </span>
                <span className="text-lg font-bold text-amber font-mono">
                    {totalKg.toFixed(1)} <span className="text-xs text-zinc-500">kg</span>
                </span>
            </div>

            {/* Sequence Steps */}
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-3">
                Sequence Steps
            </label>
            <div className="space-y-3 mb-4">
                {steps.map((step: RecipeStep, index: number) => (
                    <div
                        key={index}
                        className="flex items-center gap-3 bg-zinc-800/30 p-3 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                        {/* Step number */}
                        <span className="flex-shrink-0 bg-zinc-800 w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-mono text-amber font-bold">
                            {index + 1}
                        </span>

                        {/* Menu item select */}
                        <select
                            value={step.menuId}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateStepMenu(index, parseInt(e.target.value))}
                            className="flex-1 bg-zinc-800 border border-zinc-700 px-3 py-2 rounded text-sm font-mono focus:border-amber outline-none text-white appearance-none cursor-pointer"
                        >
                            {menuItems.map((item: ParsedMenuItem) => (
                                <option key={item.id} value={item.id}>
                                    {item.id}. {item.name}
                                </option>
                            ))}
                        </select>

                        {/* Target weight */}
                        <Stepper
                            label=""
                            unit="kg"
                            min={0.1}
                            max={200}
                            step={0.1}
                            value={step.targetKg}
                            onChange={(v: number) => updateStepWeight(index, v)}
                        />

                        {/* Remove button */}
                        {steps.length > 1 && (
                            <button
                                className="flex-shrink-0 text-zinc-600 hover:text-red-500 transition-colors p-1"
                                onClick={() => removeStep(index)}
                                title="Remove step"
                            >
                                <span className="text-xs font-mono uppercase">✕</span>
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Add Step Button */}
            <Button
                variant="secondary"
                className="w-full border-dashed !border-zinc-700 hover:!border-amber text-zinc-500 hover:text-amber py-3 mb-8"
                onClick={addStep}
            >
                + ADD COMPONENT
            </Button>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800">
                <Button variant="secondary" onClick={onCancel}>
                    CANCEL
                </Button>
                <Button
                    onClick={handleSave}
                    className="!bg-amber !text-black hover:!bg-amber/90 font-bold tracking-widest"
                >
                    SAVE BLEND
                </Button>
            </div>
        </Card>
    );
};
