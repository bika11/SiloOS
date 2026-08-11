/**
 * useDoseRunner — thin controller around the EXISTING, unmodified RecipeRunner.
 *
 * Guardrail: this adds NO new control logic. A single "Start dose" is run as a
 * one-step recipe through RecipeRunner, so the safe dispense handshake
 * (dose_request → awaitDoseAck → sendCustomOrder → dose_started, compensation,
 * abort) is exactly the production path. We only observe RecipeUpdate for the
 * console's telemetry and mirror RecipesPanel's global-abort wiring.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiloManager } from '../../bluetooth/SiloManager';
import type { TopBrewerConnection } from '../../bluetooth/TopBrewerConnection';
import type { Recipe } from '../dosing/Recipe';
import { RecipeRunner, type RecipeUpdate } from '../dosing/RecipeRunner';
import { logger } from '../../utils/logger';
import type { ConsoleSilo } from './siloModel';

export interface DoseRunnerApi {
  update: RecipeUpdate | null;
  busy: boolean;
  message: string | null;
  startDose: (silo: ConsoleSilo, targetKg: number) => void;
  runRecipe: (recipe: Recipe) => void;
  abort: () => void;
}

export function useDoseRunner(
  siloManager: SiloManager,
  connection: TopBrewerConnection | null,
): DoseRunnerApi {
  const [runner, setRunner] = useState<RecipeRunner | null>(null);
  const [update, setUpdate] = useState<RecipeUpdate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runnerRef = useRef<RecipeRunner | null>(null);

  useEffect(() => {
    runnerRef.current = runner;
  }, [runner]);

  // Global abort (E-stop) → abort the active runner, like RecipesPanel.
  useEffect(() => {
    const onGlobalAbort = (reason: string) => {
      if (runnerRef.current) runnerRef.current.abort(reason);
    };
    siloManager.addGlobalAbortListener(onGlobalAbort);
    return () => siloManager.removeGlobalAbortListener(onGlobalAbort);
  }, [siloManager]);

  // Wire runner lifecycle events.
  useEffect(() => {
    if (!runner) return;
    runner.events.onUpdate = (u: RecipeUpdate) => setUpdate({ ...u });
    runner.events.onComplete = () => {
      setTimeout(() => { setRunner(null); setUpdate(null); }, 4000);
    };
    runner.events.onAbort = (reason: string) => {
      setMessage(reason || 'Dose aborted');
      setTimeout(() => { setRunner(null); setUpdate(null); setMessage(null); }, 4000);
    };
    return () => {
      runner.events.onUpdate = undefined;
      runner.events.onComplete = undefined;
      runner.events.onAbort = undefined;
    };
  }, [runner]);

  const launch = useCallback(
    (recipe: Recipe) => {
      if (runnerRef.current || !connection) {
        if (!connection) setMessage('Machine offline — cannot dose');
        return;
      }
      const r = new RecipeRunner(recipe, siloManager, connection);
      const result = r.start();
      if (!result.started) {
        setMessage(result.reason || 'Dose could not start');
        setTimeout(() => setMessage(null), 8000);
        return;
      }
      setMessage(null);
      setRunner(r);
    },
    [siloManager, connection],
  );

  const startDose = useCallback(
    (silo: ConsoleSilo, targetKg: number) => {
      const recipe: Recipe = {
        id: `live-${silo.menuId}-${targetKg}`,
        name: silo.title,
        steps: [{ menuId: silo.menuId, menuName: silo.id, targetKg }],
      };
      logger.info('Console', `Start dose: silo="${silo.id}" menuId=${silo.menuId} target=${targetKg}kg`);
      launch(recipe);
    },
    [launch],
  );

  const abort = useCallback(() => {
    runnerRef.current?.abort('Operator abort');
  }, []);

  return { update, busy: !!runner, message, startDose, runRecipe: launch, abort };
}
