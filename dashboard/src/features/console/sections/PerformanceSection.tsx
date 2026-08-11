/**
 * PerformanceSection — Phase 4: renders what's derivable now (per-silo learned
 * flow + recent overshoot from getProfiles()), with historical totals/accuracy
 * clearly marked as awaiting the Phase 5 bridge dose-history store.
 */
import { InfoRow, Label, Sparkline } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';

interface PerformanceSectionProps {
  silos: ConsoleSilo[];
}

function Kpi({ label, note }: { label: string; note: string }) {
  return (
    <div style={{ padding: '26px 24px' }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 200, lineHeight: 1, color: 'var(--text-tertiary)' }}>—</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>{note}</div>
    </div>
  );
}

export function PerformanceSection({ silos }: PerformanceSectionProps) {
  return (
    <section id="performance" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Performance" aside="Awaiting bridge history · Phase 5" />

      {/* KPI tiles — placeholders until the bridge persists dose history */}
      <div className="console-grid-seam" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', borderTop: '1px solid var(--border-color)' }}>
        <Kpi label="Dispensed today" note="Needs bridge history" />
        <Kpi label="This week" note="Needs bridge history" />
        <Kpi label="This month" note="Needs bridge history" />
        <Kpi label="Mean abs error" note="Needs bridge history" />
        <Kpi label="Within ± 0.1 kg" note="Needs bridge history" />
      </div>

      {/* Learned flow + recent overshoot per silo — live from profiles */}
      <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', padding: '30px 28px 26px' }}>
        <Label>Learned flow & recent overshoot per silo</Label>
        <div style={{ marginTop: 18 }}>
          {silos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No silos yet.</div>}
          {silos.map((s) => {
            const p = s.profile;
            const series = p?.recentOvershootsKg?.length ? p.recentOvershootsKg : [0, 0];
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '1.6px', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <Sparkline points={series} width={180} height={26} />
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', width: 120, textAlign: 'right' }}>
                  {p ? `${p.flowRateKgPerS.toFixed(2)} kg/s` : '—'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 90, textAlign: 'right' }}>
                  {p ? `${p.totalDoses} doses` : '0 doses'}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Sparkline shows recent per-dose overshoot (kg). Full dispensed totals, accuracy log and error distribution arrive when the bridge persists dose history (Phase 5).
        </div>
      </div>

      {/* Accuracy log placeholder */}
      <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Label>Accuracy — last doses</Label>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '1px' }}>TARGET → ACTUAL</span>
        </div>
        <div style={{ marginTop: 20 }}>
          <InfoRow label="Dose history" value="Awaiting bridge store (Phase 5)" divider={false} />
        </div>
      </div>
    </section>
  );
}
