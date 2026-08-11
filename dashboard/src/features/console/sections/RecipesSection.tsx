/**
 * RecipesSection — blend recipes as a silo-blend view over the EXISTING model.
 *
 * A recipe step stays {menuId, menuName, targetKg}; "silo" == menuName. CRUD
 * persists via siloManager.updateRecipes (unchanged JSON contract) and runs via
 * the shared useDoseRunner → the unmodified RecipeRunner. No control changes.
 */
import { useEffect, useState } from 'react';
import type { SiloManager } from '../../../bluetooth/SiloManager';
import type { Recipe, RecipeStep } from '../../dosing/Recipe';
import { Button, Label, Stepper } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';
import type { DoseRunnerApi } from '../useDoseRunner';

interface RecipesSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
  runner: DoseRunnerApi;
}

const stepTotal = (steps: RecipeStep[]) => steps.reduce((a, s) => a + s.targetKg, 0);

export function RecipesSection({ siloManager, silos, runner }: RecipesSectionProps) {
  const [recipes, setRecipes] = useState<Record<string, Recipe>>(siloManager.getRecipes());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onRecipes = (r: Record<string, Recipe>) => setRecipes(r);
    siloManager.addRecipesListener(onRecipes);
    return () => siloManager.removeRecipesListener(onRecipes);
  }, [siloManager]);

  const list = Object.values(recipes);
  const active = (activeId && recipes[activeId]) || list[0] || null;

  const persist = (next: Record<string, Recipe>) => {
    setRecipes(next);
    siloManager.updateRecipes(next);
  };

  const mutateActive = (fn: (r: Recipe) => Recipe) => {
    if (!active) return;
    persist({ ...recipes, [active.id]: fn(active) });
  };

  const addRecipe = () => {
    const id = `r-${Date.now()}`;
    const first = silos[0];
    const recipe: Recipe = {
      id,
      name: 'New blend',
      steps: first ? [{ menuId: first.menuId, menuName: first.id, targetKg: 10 }] : [],
    };
    persist({ ...recipes, [id]: recipe });
    setActiveId(id);
    setEditing(true);
  };

  const deleteRecipe = () => {
    if (!active) return;
    const next = { ...recipes };
    delete next[active.id];
    persist(next);
    setActiveId(null);
    setEditing(false);
  };

  const cycleSilo = (i: number) => {
    if (!silos.length) return;
    mutateActive((r) => ({
      ...r,
      steps: r.steps.map((st, j) => {
        if (j !== i) return st;
        const idx = silos.findIndex((s) => s.menuId === st.menuId);
        const nextSilo = silos[(idx + 1 + silos.length) % silos.length];
        return { ...st, menuId: nextSilo.menuId, menuName: nextSilo.id };
      }),
    }));
  };
  const setStepKg = (i: number, kg: number) =>
    mutateActive((r) => ({ ...r, steps: r.steps.map((st, j) => (j === i ? { ...st, targetKg: kg } : st)) }));
  const removeStep = (i: number) =>
    mutateActive((r) => ({ ...r, steps: r.steps.filter((_, j) => j !== i) }));
  const addStep = () => {
    const first = silos[0];
    if (!first) return;
    mutateActive((r) => ({ ...r, steps: [...r.steps, { menuId: first.menuId, menuName: first.id, targetKg: 10 }] }));
  };

  return (
    <section id="recipes" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead
        title="Blend recipes"
        aside={
          <span style={{ display: 'inline-flex', gap: 16, alignItems: 'baseline' }}>
            <span>{`${list.length} recipes`}</span>
            <button type="button" onClick={addRecipe} style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', height: 30, padding: '0 12px', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              + New recipe
            </button>
          </span>
        }
      />

      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 420px', borderTop: '1px solid var(--border-color)' }}>
        {/* Recipe list */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 130px', gap: 20, padding: '14px 28px', borderBottom: '1px solid var(--border-color)' }}>
            {['Recipe', 'Steps', 'Total', 'Last run'].map((h, i) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
            ))}
          </div>
          {list.length === 0 ? (
            <div style={{ padding: '40px 28px', color: 'var(--text-secondary)', fontSize: 13 }}>No blends yet. Create one to sequence silo doses.</div>
          ) : (
            list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setActiveId(r.id); setEditing(false); }}
                style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 90px 110px 130px', gap: 20, alignItems: 'baseline', padding: '20px 28px', background: active?.id === r.id ? 'var(--surface)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontFamily: 'var(--font-brand)', textAlign: 'left' }}
              >
                <span style={{ fontSize: 15, fontWeight: 300, color: 'var(--text-primary)' }}>{r.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.steps.length}</span>
                <span style={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{stepTotal(r.steps).toFixed(1)} kg</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>{r.lastUsed ? new Date(r.lastUsed).toLocaleDateString() : '—'}</span>
              </button>
            ))
          )}
        </div>

        {/* Selected recipe editor */}
        <div style={{ padding: 28 }}>
          {!active ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select or create a recipe.</div>
          ) : (
            <>
              <Label>Selected recipe</Label>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginTop: 14 }}>
                <input
                  type="text"
                  value={active.name}
                  onChange={(e) => mutateActive((r) => ({ ...r, name: e.target.value }))}
                  aria-label="Recipe name"
                  style={{ flex: 1, minWidth: 0, padding: '2px 0', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', borderRadius: 0, fontFamily: 'var(--font-brand)', fontSize: 26, fontWeight: 200, letterSpacing: '-0.4px', color: 'var(--text-primary)', outline: 'none' }}
                />
                <button type="button" onClick={deleteRecipe} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--danger-text)' }}>Delete</button>
              </div>

              <div style={{ marginTop: 26 }}>
                {active.steps.map((st, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: 'var(--text-secondary)' }}>{String(i + 1).padStart(2, '0')}</span>
                      {editing ? (
                        <button type="button" onClick={() => cycleSilo(i)} style={{ height: 32, padding: '0 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 12, letterSpacing: '1px', color: 'var(--text-primary)' }}>
                          {st.menuName} ▾
                        </button>
                      ) : (
                        <span style={{ fontSize: 14 }}>{st.menuName}</span>
                      )}
                    </div>
                    {editing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Stepper value={st.targetKg} min={0.5} max={130} step={0.5} onChange={(v) => setStepKg(i, v)} unit="kg" decimalPlaces={1} size={15} />
                        <button type="button" onClick={() => removeStep(i)} aria-label="Remove step" style={{ width: 34, height: 34, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--danger-text)', fontFamily: 'var(--font-brand)', fontSize: 14 }}>×</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{st.targetKg.toFixed(1)} kg</span>
                    )}
                  </div>
                ))}
                {editing && (
                  <button type="button" onClick={addStep} style={{ width: '100%', height: 44, marginTop: 14, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-primary)' }}>+ Add step</button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '18px 0 0' }}>
                <Label>Batch total</Label>
                <span style={{ fontSize: 22, fontWeight: 200, fontVariantNumeric: 'tabular-nums' }}>{stepTotal(active.steps).toFixed(1)} kg</span>
              </div>

              {runner.busy && runner.update ? (
                <div style={{ marginTop: 26, padding: 20, background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Label tone="primary">{runner.update.state}</Label>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '1px' }}>
                      Step {Math.min(runner.update.currentStepIndex + 1, runner.update.recipe.steps.length)}/{runner.update.recipe.steps.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                    <span style={{ fontSize: 44, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{runner.update.cumulativeKg.toFixed(1)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>/ {runner.update.totalTargetKg.toFixed(1)} kg</span>
                  </div>
                  <div style={{ marginTop: 14, height: 3, background: 'var(--border-color)' }}>
                    <div style={{ height: 3, width: `${Math.min(100, runner.update.totalProgress * 100)}%`, background: 'var(--text-primary)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <Button variant="danger" onClick={runner.abort}>Abort</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: 26, display: 'flex', gap: 10 }}>
                    <Button
                      onClick={() => {
                        const stamped = { ...active, lastUsed: Date.now() };
                        persist({ ...recipes, [stamped.id]: stamped });
                        runner.runRecipe(stamped);
                      }}
                      disabled={!active.steps.length}
                    >
                      Run batch
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</Button>
                  </div>
                  {runner.message && (
                    <div role="alert" style={{ marginTop: 16, padding: '12px 16px', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', color: 'var(--danger-text)', fontSize: 13 }}>
                      {runner.message}
                    </div>
                  )}
                  <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Steps run in order. Each arms the loop, tares the hopper and stops on settled weight before the next begins.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
