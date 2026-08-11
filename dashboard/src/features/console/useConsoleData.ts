/**
 * useConsoleData — read-only subscriptions to the live bridge state for the
 * Amokka Console. These hooks ONLY read (getters + additive listeners with
 * cleanup); none of them send commands or touch the control/IO path.
 *
 * The dose *trigger* is not here — it is driven by the existing, unmodified
 * RecipeRunner (see LiveSection). These hooks render whatever dose is live,
 * regardless of which client/flow started it.
 */
import { useEffect, useState } from 'react';
import type { SiloManager, PiDoseMessage } from '../../bluetooth/SiloManager';

/** Live settings object from the bridge (theme, hidden_recipes, …). */
export function useSettings(siloManager: SiloManager) {
  const [settings, setSettings] = useState<Record<string, unknown>>(siloManager.getSettings());
  useEffect(() => {
    const onSettings = (s: Record<string, unknown>) => setSettings(s);
    siloManager.addSettingsListener(onSettings);
    return () => siloManager.removeSettingsListener(onSettings);
  }, [siloManager]);
  return settings;
}

/** Bridge + machine connection flags. */
export function useConnectionStatus(siloManager: SiloManager) {
  const [bridgeConnected, setBridgeConnected] = useState(siloManager.isBridgeConnected());
  const [machineConnected, setMachineConnected] = useState(siloManager.isMachineConnected());

  useEffect(() => {
    const onConn = (c: boolean) => setBridgeConnected(c);
    const onStatus = (c: boolean) => setMachineConnected(c);
    siloManager.addConnectionListener(onConn);
    siloManager.addStatusListener(onStatus);
    return () => {
      siloManager.removeConnectionListener(onConn);
      siloManager.removeStatusListener(onStatus);
    };
  }, [siloManager]);

  return { bridgeConnected, machineConnected };
}

/** Scale feed health ('ok' | 'stale'). 'stale' means dosing is unsafe. */
export function useScaleFeed(siloManager: SiloManager) {
  const [status, setStatus] = useState<'ok' | 'stale'>(siloManager.getScaleStatus());
  useEffect(() => {
    const onScale = (s: 'ok' | 'stale') => setStatus(s);
    siloManager.addScaleStatusListener(onScale);
    return () => siloManager.removeScaleStatusListener(onScale);
  }, [siloManager]);
  return status;
}

/**
 * Live gross hopper weight (kg). The bridge only broadcasts weight on change,
 * so we poll getWeight() ~10 Hz per the project note — never monkey-patch the
 * SiloManager event bus (other consumers clobber it).
 */
export function useHopperWeight(siloManager: SiloManager, hz = 10) {
  const [weight, setWeight] = useState(siloManager.getWeight());
  useEffect(() => {
    const id = setInterval(() => setWeight(siloManager.getWeight()), Math.round(1000 / hz));
    return () => clearInterval(id);
  }, [siloManager, hz]);
  return weight;
}

export interface LiveDose {
  active: boolean;
  state: PiDoseMessage['state'];
  siloId: string;
  dispensedKg: number;
  targetKg: number;
  progress: number;
  flowRateKgPerS: number;
  lastResult: PiDoseMessage['result'] | null;
  lastReason: string | null;
}

const IDLE_DOSE: LiveDose = {
  active: false,
  state: 'done',
  siloId: '',
  dispensedKg: 0,
  targetKg: 0,
  progress: 0,
  flowRateKgPerS: 0,
  lastResult: null,
  lastReason: null,
};

const ACTIVE_STATES = ['armed', 'running', 'stopping', 'settling'];

/**
 * Read-only view of the currently active Pi-authority dose (whoever started
 * it). Mirrors the bridge dose_ack/dose_update stream — no commands sent.
 */
export function useLiveDose(siloManager: SiloManager): LiveDose {
  const [dose, setDose] = useState<LiveDose>(IDLE_DOSE);

  useEffect(() => {
    const onAck = (siloId: string, _tareG: number, targetKg: number) => {
      setDose((d) => ({ ...d, active: true, state: 'armed', siloId, targetKg, dispensedKg: 0, progress: 0, lastReason: null }));
    };
    const onUpdate = (msg: PiDoseMessage) => {
      if (msg.state === 'done') {
        setDose((d) => ({
          ...d,
          active: false,
          state: 'done',
          dispensedKg: msg.result?.actualKg ?? d.dispensedKg,
          progress: 1,
          flowRateKgPerS: 0,
          lastResult: msg.result ?? d.lastResult,
        }));
      } else if (msg.state === 'aborted') {
        setDose((d) => ({ ...d, active: false, state: 'aborted', flowRateKgPerS: 0, lastReason: msg.reason ?? null }));
      } else {
        setDose((d) => ({
          ...d,
          active: ACTIVE_STATES.includes(msg.state),
          state: msg.state,
          siloId: msg.siloId || d.siloId,
          dispensedKg: msg.dispensedKg ?? d.dispensedKg,
          targetKg: msg.targetKg ?? d.targetKg,
          progress: msg.progress ?? d.progress,
          flowRateKgPerS: msg.flowRateKgPerS ?? d.flowRateKgPerS,
        }));
      }
    };
    const onRejected = (_siloId: string, reason: string) => {
      setDose((d) => ({ ...d, active: false, lastReason: reason }));
    };

    siloManager.addDoseAckListener(onAck);
    siloManager.addDoseUpdateListener(onUpdate);
    siloManager.addDoseRejectedListener(onRejected);
    return () => {
      siloManager.removeDoseAckListener(onAck);
      siloManager.removeDoseUpdateListener(onUpdate);
      siloManager.removeDoseRejectedListener(onRejected);
    };
  }, [siloManager]);

  return dose;
}
