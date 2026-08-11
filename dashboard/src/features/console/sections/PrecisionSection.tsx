/**
 * PrecisionSection — Phase 5.
 *
 * EDITABLE: the absolute safety backstops that live in config.json → safety and
 * are read per-dose (max_target_kg, hopper_abort_kg, max_dispense_s,
 * enforce_scale_crc). Apply persists them on the bridge (validated + clamped
 * server-side; refused while a dose is live). READ-ONLY: the dose-loop control
 * constants (settle/stall/debounce/backstop) — changing those alters when a dose
 * stops, so they stay fixed. Learned cards + Relearn use the real profiles.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SiloManager } from '../../../bluetooth/SiloManager';
import { Button, Label, Stepper, Switch } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';
import { DEFAULT_PARAMS, PARAM_SPEC, confidenceFor, emaAlpha } from '../paramSpec';

interface PrecisionSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
  doseParams: Record<string, number | boolean> | null;
}

const EDITABLE = [
  { key: 'max_target_kg', label: 'Max target weight', unit: 'kg', step: 5, dp: 0, min: 1, max: 300, help: 'Reject any dose request above this.' },
  { key: 'hopper_abort_kg', label: 'Max gross weight (hopper cap)', unit: 'kg', step: 5, dp: 0, min: 10, max: 300, help: 'Hard abort on the gross reading. Overflow backstop.' },
  { key: 'max_dispense_s', label: 'Max dispense time', unit: 's', step: 30, dp: 0, min: 30, max: 3600, help: 'Absolute wall-clock ceiling per dose. Hard abort.' },
];

// The dose-loop constants that stay fixed (subset of the mock's PARAM_SPEC).
const READONLY_KEYS = ['coast', 'settle', 'stallTime', 'stallKg', 'stale', 'debounce', 'backstop'];

export function PrecisionSection({ siloManager, silos, doseParams }: PrecisionSectionProps) {
  const [local, setLocal] = useState<Record<string, number>>({});
  const [crc, setCrc] = useState<boolean>(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Sync local editor state from the bridge whenever params arrive/change.
  useEffect(() => {
    if (!doseParams) return;
    setLocal({
      max_target_kg: Number(doseParams.max_target_kg ?? 130),
      hopper_abort_kg: Number(doseParams.hopper_abort_kg ?? 130),
      max_dispense_s: Number(doseParams.max_dispense_s ?? 600),
    });
    setCrc(Boolean(doseParams.enforce_scale_crc));
  }, [doseParams]);

  useEffect(() => {
    const onRej = (reason: string) => { setMsg(reason); setTimeout(() => setMsg(null), 6000); };
    siloManager.addDoseParamsRejectedListener(onRej);
    return () => siloManager.removeDoseParamsRejectedListener(onRej);
  }, [siloManager]);

  const dirty = useMemo(() => {
    if (!doseParams) return false;
    return (
      Number(doseParams.max_target_kg) !== local.max_target_kg ||
      Number(doseParams.hopper_abort_kg) !== local.hopper_abort_kg ||
      Number(doseParams.max_dispense_s) !== local.max_dispense_s ||
      Boolean(doseParams.enforce_scale_crc) !== crc
    );
  }, [doseParams, local, crc]);

  const apply = () => siloManager.updateDoseParams({ ...local, enforce_scale_crc: crc });
  const reset = () => siloManager.updateDoseParams({ max_target_kg: 130, hopper_abort_kg: 130, max_dispense_s: 600, enforce_scale_crc: true });

  const readonlyParams = PARAM_SPEC.filter((p) => READONLY_KEYS.includes(p.key));

  return (
    <section id="precision" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Precision & learning" aside="config.json · dose_controller.py" />

      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 420px', borderTop: '1px solid var(--border-color)' }}>
        {/* Safety backstops — editable */}
        <div style={{ padding: '30px 28px' }}>
          <Label>Safety backstops</Label>
          {!doseParams && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>Waiting for the bridge…</div>}
          {doseParams && (
            <div style={{ marginTop: 12 }}>
              {EDITABLE.map((p) => (
                <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 230px', gap: 24, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>{p.label}</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.help}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Stepper
                      value={local[p.key] ?? 0}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      decimalPlaces={p.dp}
                      unit={p.unit}
                      size={20}
                      onChange={(v) => setLocal((s) => ({ ...s, [p.key]: v }))}
                    />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: 14 }}>Enforce scale CRC</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Drop scale frames failing Modbus CRC16. Leave on unless framing changes.</div>
                </div>
                <Switch checked={crc} onChange={setCrc} aria-label="Enforce scale CRC" />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 26, maxWidth: 420 }}>
                <Button onClick={apply} disabled={!dirty}>{dirty ? 'Apply to bridge' : 'Applied'}</Button>
                <Button variant="ghost" onClick={reset}>Defaults</Button>
              </div>
              {msg && (
                <div role="alert" style={{ marginTop: 16, padding: '12px 16px', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', color: 'var(--danger-text)', fontSize: 13 }}>{msg}</div>
              )}

              {/* Fixed control constants — read-only */}
              <div style={{ marginTop: 34 }}>
                <Label>Control constants · fixed</Label>
                <div style={{ marginTop: 12 }}>
                  {readonlyParams.map((p) => (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 13 }}>{p.label}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{DEFAULT_PARAMS[p.key].toFixed(p.dp)} {p.unit}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  These govern when a dose stops and are fixed in the control loop; coast-down is learned per silo (right). Changing them is a separate, reviewed change.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* What the loop has learned — live from the real profiles */}
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
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Reset the learned profile for "${s.title}"?`)) siloManager.relearnSilo(s.id); }}
                      style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}
                    >
                      Relearn
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Coast-down is the primary control quantity, learned by integral feedback on the net error and damped as a silo passes 3, 10 and 30 doses. Relearn resets it (silo_profiles.json).
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
