/**
 * PerformanceSection — Phase 5: real analytics from the bridge dose-history
 * store (siloManager.getDoseHistory), with graceful empty states before any
 * dose has been logged. Per-silo learned flow still comes from profiles.
 */
import { InfoRow, Label, Sparkline } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import type { ConsoleSilo } from '../siloModel';

interface DoseLogRow { ts: number; silo: string; targetKg: number; actualKg: number; errorKg: number }
interface History {
  kpis: { todayKg: number; todayCount: number; weekKg: number; weekCount: number; monthKg: number; monthCount: number; meanAbsErrKg: number | null; withinTolPct: number | null };
  perSilo: Record<string, { today: number; week: number; month: number }>;
  doseLog: DoseLogRow[];
  histogram: { label: string; count: number }[];
  recentBySilo: Record<string, number[]>;
  abortCount: number;
  totalDoses: number;
}

interface PerformanceSectionProps {
  silos: ConsoleSilo[];
  history: History | null;
}

const fmt = (n: number | null | undefined, dp = 1) => (n == null ? '—' : n.toFixed(dp));
const hhmm = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function Kpi({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div style={{ padding: '26px 24px' }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: value === '—' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>{note}</div>
    </div>
  );
}

export function PerformanceSection({ silos, history }: PerformanceSectionProps) {
  const k = history?.kpis;
  const maxHist = Math.max(1, ...(history?.histogram ?? []).map((h) => h.count));
  const empty = !history || history.totalDoses === 0;

  return (
    <section id="performance" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Performance" aside={empty ? 'No doses logged yet' : `${history!.totalDoses} doses · rolling`} />

      {/* KPI tiles */}
      <div className="console-grid-seam" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', borderTop: '1px solid var(--border-color)' }}>
        <Kpi label="Dispensed today" value={fmt(k?.todayKg)} unit="kg" note={`${k?.todayCount ?? 0} doses`} />
        <Kpi label="This week" value={fmt(k?.weekKg)} unit="kg" note={`${k?.weekCount ?? 0} doses`} />
        <Kpi label="This month" value={fmt(k?.monthKg)} unit="kg" note={`${k?.monthCount ?? 0} doses`} />
        <Kpi label="Mean abs error" value={fmt(k?.meanAbsErrKg, 3)} unit="kg" note="Last 50 doses" />
        <Kpi label="Within ± 0.1 kg" value={k?.withinTolPct == null ? '—' : String(k.withinTolPct)} unit="%" note="Last 50 doses" />
      </div>

      {/* Learned flow + recent error sparkline per silo */}
      <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', padding: '30px 28px 26px' }}>
        <Label>Learned flow & recent error per silo</Label>
        <div style={{ marginTop: 18 }}>
          {silos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No silos yet.</div>}
          {silos.map((s) => {
            const series = history?.recentBySilo?.[s.id];
            const disp = history?.perSilo?.[s.id];
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '1.6px', width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <Sparkline points={series && series.length > 1 ? series : [0, 0]} width={160} height={26} />
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', width: 110, textAlign: 'right' }}>{s.profile ? `${s.profile.flowRateKgPerS.toFixed(2)} kg/s` : '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 110, textAlign: 'right' }}>{disp ? `${disp.today.toFixed(1)} kg today` : '0 kg today'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accuracy log + histogram */}
      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 1fr', borderTop: 'none' }}>
        <div style={{ padding: '30px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label>Accuracy — last doses</Label>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '1px' }}>TARGET → ACTUAL</span>
          </div>
          <div style={{ marginTop: 20 }}>
            {empty && <InfoRow label="Dose history" value="No doses logged yet" divider={false} />}
            {(history?.doseLog ?? []).map((d, i) => {
              const good = Math.abs(d.errorKg) <= 0.1;
              const sign = d.errorKg > 0 ? '+' : d.errorKg < 0 ? '−' : '±';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 70px 70px 70px', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(d.ts)}</span>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.silo}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.targetKg?.toFixed(1)}</span>
                  <span style={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.actualKg?.toFixed(1)}</span>
                  <span style={{ fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: good ? 'var(--text-secondary)' : 'var(--danger-text)' }}>{sign}{Math.abs(d.errorKg).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '30px 28px' }}>
          <Label>Error distribution</Label>
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
            {(history?.histogram ?? []).map((h, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 7, fontVariantNumeric: 'tabular-nums' }}>{h.count}</span>
                <div style={{ height: Math.max(2, (h.count / maxHist) * 120), background: h.label === '0' ? 'var(--surface)' : 'transparent', borderTop: `1px solid ${h.label === '0' ? 'var(--color-success)' : 'var(--text-primary)'}` }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            {(history?.histogram ?? []).map((h, i) => (
              <span key={i} style={{ flex: 1, fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>{h.label}</span>
            ))}
          </div>
          <div style={{ marginTop: 22 }}>
            <InfoRow label="Aborted doses (7 d)" value={String(history?.abortCount ?? 0)} divider={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
