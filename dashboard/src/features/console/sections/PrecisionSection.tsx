/**
 * PrecisionSection — Phase 7 C1: the safety backstops AND the dose-loop control
 * constants are now editable. Each maps to config.json (safety / control); the
 * bridge clamps server-side, refuses edits mid-dose, and applies them to the NEXT
 * dose only. Coast-down stays per-silo learned (shown read-only + Relearn) — a
 * global coast override would fight the learner.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SiloManager } from '../../../bluetooth/SiloManager';
import { Button, Label, Stepper, Switch } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';
import { confidenceFor, emaAlpha } from '../paramSpec';

interface PrecisionSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
  doseParams: Record<string, number | boolean> | null;
}

interface Spec { key: string; label: string; unit: string; step: number; dp: number; min: number; max: number; help: string }

const SAFETY: Spec[] = [
  { key: 'max_target_kg', label: 'Max target weight', unit: 'kg', step: 5, dp: 0, min: 1, max: 300, help: 'Reject any dose request above this.' },
  { key: 'hopper_abort_kg', label: 'Max gross weight (hopper cap)', unit: 'kg', step: 5, dp: 0, min: 10, max: 300, help: 'Hard abort on the gross reading. Overflow backstop.' },
  { key: 'max_dispense_s', label: 'Max dispense time', unit: 's', step: 30, dp: 0, min: 30, max: 3600, help: 'Absolute wall-clock ceiling per dose. Hard abort.' },
];

const CONTROL: Spec[] = [
  { key: 'settle_s', label: 'Settle window', unit: 's', step: 0.5, dp: 1, min: 0.5, max: 10, help: 'Quiet time on the scale before a dose is called complete.' },
  { key: 'stall_time_s', label: 'Stall timeout', unit: 's', step: 0.5, dp: 1, min: 1, max: 15, help: 'No weight change for this long while running triggers a stop.' },
  { key: 'stall_kg', label: 'Stall threshold', unit: 'kg', step: 0.005, dp: 3, min: 0.001, max: 0.1, help: 'Change below this counts as no movement.' },
  { key: 'scale_stale_s', label: 'Scale-feed watchdog', unit: 's', step: 0.5, dp: 1, min: 0.5, max: 5, help: 'Force-cancel if no weight frame arrives — dosing blind is never allowed.' },
  { key: 'debounce', label: 'Median debounce', unit: 'frames', step: 1, dp: 0, min: 1, max: 9, help: 'Frames voted on before a reading can trip a stop. Rejects single spikes.' },
  { key: 'backstop_mult', label: 'Preemptive backstop', unit: '× expected', step: 0.1, dp: 1, min: 1, max: 3, help: 'Timer multiple of expected fill time. Must never race the weight-based stop.' },
];

const DEFAULTS: Record<string, number> = {
  max_target_kg: 130, hopper_abort_kg: 130, max_dispense_s: 600,
  settle_s: 2.0, stall_time_s: 3.0, stall_kg: 0.005, scale_stale_s: 1.5, debounce: 3, backstop_mult: 1.5,
};
const ALL = [...SAFETY, ...CONTROL];

export function PrecisionSection({ siloManager, silos, doseParams }: PrecisionSectionProps) {
  const [local, setLocal] = useState<Record<string, number>>({});
  const [crc, setCrc] = useState<boolean>(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!doseParams) return;
    const next: Record<string, number> = {};
    for (const s of ALL) next[s.key] = Number(doseParams[s.key] ?? DEFAULTS[s.key]);
    setLocal(next);
    setCrc(Boolean(doseParams.enforce_scale_crc));
  }, [doseParams]);

  useEffect(() => {
    const onRej = (reason: string) => { setMsg(reason); setTimeout(() => setMsg(null), 6000); };
    siloManager.addDoseParamsRejectedListener(onRej);
    return () => siloManager.removeDoseParamsRejectedListener(onRej);
  }, [siloManager]);

  const dirty = useMemo(() => {
    if (!doseParams) return false;
    if (Boolean(doseParams.enforce_scale_crc) !== crc) return true;
    return ALL.some((s) => Number(doseParams[s.key] ?? DEFAULTS[s.key]) !== local[s.key]);
  }, [doseParams, local, crc]);

  const apply = () => siloManager.updateDoseParams({ ...local, enforce_scale_crc: crc });
  const reset = () => siloManager.updateDoseParams({ ...DEFAULTS, enforce_scale_crc: true });

  const renderRow = (p: Spec) => (
    <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 230px', gap: 24, alignItems: 'center', padding: '15px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div>
        <div style={{ fontSize: 14 }}>{p.label}</div>
        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.help}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Stepper value={local[p.key] ?? 0} min={p.min} max={p.max} step={p.step} decimalPlaces={p.dp} unit={p.unit} size={20} onChange={(v) => setLocal((s) => ({ ...s, [p.key]: v }))} />
      </div>
    </div>
  );

  return (
    <section id="precision" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Precision & learning" aside="config.json · dose_controller.py" />

      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 420px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ padding: '30px 28px' }}>
          {!doseParams && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Waiting for the bridge…</div>}
          {doseParams && (
            <>
              <Label>Safety backstops</Label>
              <div style={{ marginTop: 12 }}>
                {SAFETY.map(renderRow)}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '15px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>Enforce scale CRC</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Drop scale frames failing Modbus CRC16. Leave on unless framing changes.</div>
                  </div>
                  <Switch checked={crc} onChange={setCrc} aria-label="Enforce scale CRC" />
                </div>
              </div>

              <div style={{ marginTop: 30 }}>
                <Label>Control tuning</Label>
                <div style={{ marginTop: 12 }}>{CONTROL.map(renderRow)}</div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 26, maxWidth: 420 }}>
                <Button onClick={apply} disabled={!dirty}>{dirty ? 'Apply to bridge' : 'Applied'}</Button>
                <Button variant="ghost" onClick={reset}>Defaults</Button>
              </div>
              {msg && (
                <div role="alert" style={{ marginTop: 16, padding: '12px 16px', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', color: 'var(--danger-text)', fontSize: 13 }}>{msg}</div>
              )}
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Changes are clamped server-side, refused while a dose is live, and apply to the next dose only. Coast-down is learned per silo (right), not set here.
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '30px 28px' }}>
          <Label>What the loop has learned</Label>
          <div style={{ marginTop: 20 }}>
            {silos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No silos yet.</div>}
            {silos.map((s) => {
              const p = s.profile;
              const conf = confidenceFor(p?.totalDoses ?? 0);
              return (
                <div key={s.id} style={{ padding: '18px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '1.6px' }}>{s.title}</span>
                    <span style={{ fontSize: 11, letterSpacing: '1.4px', textTransform: 'uppercase', color: conf === 'Converged' ? 'var(--color-success)' : 'var(--text-secondary)' }}>{conf}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                    <Stat label="Coast" value={p?.overshootKg != null ? p.overshootKg.toFixed(3) : '—'} />
                    <Stat label="Valve delay" value={p ? p.valveDelayS.toFixed(2) : '—'} />
                    <Stat label="Flow kg/s" value={p ? p.flowRateKgPerS.toFixed(2) : '—'} />
                    <Stat label="EMA α" value={p ? emaAlpha(p.totalDoses).toFixed(1) : '—'} />
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p?.totalDoses ?? 0} doses learned</span>
                    <button type="button" onClick={() => { if (confirm(`Reset the learned profile for "${s.title}"?`)) siloManager.relearnSilo(s.id); }} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Relearn</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
