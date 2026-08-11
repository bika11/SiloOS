/**
 * PrecisionSection — control parameters + what the loop has learned.
 *
 * Phase 4: control params render READ-ONLY (values default until the bridge
 * exposes them in Phase 5). Per-silo learned data is live from getProfiles().
 * "Relearn" uses the EXISTING updateProfiles reset (same as classic Settings) —
 * it resets learned data the loop reads; it does not touch the control loop.
 */
import type { SiloManager } from '../../../bluetooth/SiloManager';
import type { SiloProfile } from '../../dosing/DoseController';
import { Label } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';
import { DEFAULT_PARAMS, PARAM_SPEC, confidenceFor } from '../paramSpec';

interface PrecisionSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
}

const DEFAULT_FLOW = 0.05;
const DEFAULT_DELAY = 0.5;

export function PrecisionSection({ siloManager, silos }: PrecisionSectionProps) {
  const relearn = (siloId: string) => {
    const fresh: SiloProfile = { flowRateKgPerS: DEFAULT_FLOW, valveDelayS: DEFAULT_DELAY, totalDoses: 0, recentOvershootsKg: [] };
    siloManager.updateProfiles({ [siloId]: fresh });
  };

  return (
    <section id="precision" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Precision & learning" aside="dose_controller.py" />

      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 420px', borderTop: '1px solid var(--border-color)' }}>
        {/* Control parameters — read-only in Phase 4 */}
        <div style={{ padding: '30px 28px' }}>
          <Label>Control parameters</Label>
          <div style={{ marginTop: 12 }}>
            {PARAM_SPEC.map((p) => (
              <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 24, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{p.label}</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.help}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 20, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {DEFAULT_PARAMS[p.key].toFixed(p.dp)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 5 }}>{p.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Read-only. Default values shown — live values and validated write-back to <code>config.json</code> land in Phase 5, once the bridge exposes the safety params. Server-side caps stay authoritative regardless.
          </div>
        </div>

        {/* What the loop has learned — live from profiles */}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                    <LearnStat label="Coast" value={p?.overshootKg != null ? `${p.overshootKg.toFixed(3)}` : '—'} />
                    <LearnStat label="Valve delay" value={p ? `${p.valveDelayS.toFixed(2)}` : '—'} />
                    <LearnStat label="Flow kg/s" value={p ? `${p.flowRateKgPerS.toFixed(2)}` : '—'} />
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p?.totalDoses ?? 0} doses learned</span>
                    <button type="button" onClick={() => relearn(s.id)} style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Relearn</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Each completed dose feeds integral feedback on the net error; the stop point moves earlier on overshoot, damped as a silo passes 3, 10 and 30 doses.
          </div>
        </div>
      </div>
    </section>
  );
}

function LearnStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
