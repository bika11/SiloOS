/**
 * Precision control-parameter spec — mirrors the safety block in config.json +
 * dose_controller.py (SiloOS Console design). Phase 4 renders these read-only;
 * Phase 5 wires live values + validated write-back over the WebSocket.
 */
export interface ParamSpec {
  key: string;
  label: string;
  unit: string;
  step: number;
  dp: number;
  min: number;
  max: number;
  help: string;
}

export const PARAM_SPEC: ParamSpec[] = [
  { key: 'coast', label: 'Coast-down allowance', unit: 'kg', step: 0.005, dp: 3, min: 0, max: 3,
    help: 'Material still in flight after the stop signal. The loop stops at target minus this.' },
  { key: 'settle', label: 'Settle window', unit: 's', step: 0.5, dp: 1, min: 0.5, max: 10,
    help: 'Quiet time on the scale before a dose is called complete.' },
  { key: 'stallTime', label: 'Stall timeout', unit: 's', step: 0.5, dp: 1, min: 1, max: 15,
    help: 'No meaningful weight change for this long while running triggers a stop.' },
  { key: 'stallKg', label: 'Stall threshold', unit: 'kg', step: 0.005, dp: 3, min: 0.001, max: 0.1,
    help: 'Change below this counts as no movement.' },
  { key: 'stale', label: 'Scale-feed watchdog', unit: 's', step: 0.5, dp: 1, min: 0.5, max: 5,
    help: 'Force-cancel if no weight frame arrives — dosing blind is never allowed.' },
  { key: 'debounce', label: 'Median debounce window', unit: 'frames', step: 1, dp: 0, min: 1, max: 9,
    help: 'Frames voted on before a reading can trip a stop. Rejects single spikes.' },
  { key: 'backstop', label: 'Preemptive backstop', unit: '× expected', step: 0.1, dp: 1, min: 1, max: 3,
    help: 'Timer multiple of expected fill time. Must never race the weight-based stop.' },
  { key: 'maxTime', label: 'Max dispense time', unit: 's', step: 30, dp: 0, min: 60, max: 1800,
    help: 'Absolute wall-clock ceiling per dose. Hard abort.' },
  { key: 'maxWeight', label: 'Max gross weight', unit: 'kg', step: 5, dp: 0, min: 20, max: 300,
    help: 'Hopper overflow cap on the gross reading. Hard abort.' },
];

/** Fallback display values until the bridge syncs live dose_params (Phase 5). */
export const DEFAULT_PARAMS: Record<string, number> = {
  coast: 0.31, settle: 2.0, stallTime: 3.0, stallKg: 0.005, stale: 1.5,
  debounce: 3, backstop: 1.5, maxTime: 600, maxWeight: 130,
};

export function confidenceFor(totalDoses: number): 'Learning' | 'Settling' | 'Converged' {
  if (totalDoses >= 30) return 'Converged';
  if (totalDoses >= 10) return 'Settling';
  return 'Learning';
}
