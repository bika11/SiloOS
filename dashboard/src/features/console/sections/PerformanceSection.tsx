/**
 * PerformanceSection — analytics from the bridge dose-history store
 * (siloManager.getDoseHistory), with graceful empty states. Per-silo learned
 * flow comes from profiles; runs-per-recipe from the recipe store. Bridge stats,
 * top-up corrections and the predictive lead-time block arrive in Batch B/C.
 */
import { useEffect, useState } from 'react';
import type { SiloManager } from '../../../bluetooth/SiloManager';
import type { Recipe } from '../../dosing/Recipe';
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
  topUpCount: number;
  topUpMeanShortfall: number;
  leadNow: number | null;
  leadSeries: number[];
  leadTrend: number | null;
}

interface BridgeStats {
  startTs: number;
  reconnects: number;
  framesTotal: number;
  framesDropped: number;
  dropRatePct: number;
  lastTareTs: number;
  tareOffset: number;
  tareSeries: number[];
}

interface PerformanceSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
  history: History | null;
  bridgeStats: BridgeStats | null;
}

function fmtUptime(startTs: number): string {
  if (!startTs) return '—';
  const s = Math.max(0, Date.now() / 1000 - startTs);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} d ${h} h` : `${h} h ${m} m`;
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

export function PerformanceSection({ siloManager, silos, history, bridgeStats }: PerformanceSectionProps) {
  const [recipes, setRecipes] = useState<Record<string, Recipe>>(siloManager.getRecipes());
  useEffect(() => {
    const on = (r: Record<string, Recipe>) => setRecipes(r);
    siloManager.addRecipesListener(on);
    return () => siloManager.removeRecipesListener(on);
  }, [siloManager]);

  const k = history?.kpis;
  const maxHist = Math.max(1, ...(history?.histogram ?? []).map((h) => h.count));
  const empty = !history || history.totalDoses === 0;

  const perSilo = history?.perSilo ?? {};
  const todayTotal = Object.values(perSilo).reduce((a, s) => a + (s.today || 0), 0);
  const maxToday = Math.max(0.001, ...silos.map((s) => perSilo[s.id]?.today || 0));

  const recipeList = Object.values(recipes);
  const maxRuns = Math.max(1, ...recipeList.map((r) => r.runs ?? 0));

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

      {/* Dispensed by silo */}
      <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', padding: '30px 28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Label>Dispensed by silo</Label>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Today {fmt(todayTotal)} kg across {silos.length} silos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, silos.length))}, minmax(0, 1fr))`, gap: 40, marginTop: 24 }}>
          {silos.map((s) => {
            const d = perSilo[s.id] || { today: 0, week: 0, month: 0 };
            const share = todayTotal > 0 ? (d.today / todayTotal) * 100 : 0;
            return (
              <div key={s.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px' }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{share.toFixed(0)}% of today</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 12 }}>
                  <span style={{ fontSize: 32, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.today.toFixed(1)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>kg today</span>
                </div>
                <div style={{ marginTop: 14, height: 3, background: 'var(--border-color)' }}>
                  <div style={{ height: 3, background: 'var(--text-primary)', width: `${(d.today / maxToday) * 100}%` }} />
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{d.week.toFixed(1)} kg this week</div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{d.month.toFixed(1)} kg this month</div>
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
              const w = Math.min(50, (Math.abs(d.errorKg) / 0.4) * 50);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 60px 60px 1fr 64px', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(d.ts)}</span>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.silo}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.targetKg?.toFixed(1)}</span>
                  <span style={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.actualKg?.toFixed(1)}</span>
                  <div style={{ position: 'relative', height: 8 }}>
                    <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: 'var(--border-color)' }} />
                    <div style={{ position: 'absolute', top: 2, height: 4, left: d.errorKg >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(1, w)}%`, background: good ? 'var(--color-success)' : 'var(--color-danger)' }} />
                  </div>
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

      {/* Learned flow + runs per recipe */}
      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 1fr', borderTop: 'none' }}>
        <div style={{ padding: '30px 28px' }}>
          <Label>Learned flow & recent error per silo</Label>
          <div style={{ marginTop: 18 }}>
            {silos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No silos yet.</div>}
            {silos.map((s) => {
              const series = history?.recentBySilo?.[s.id];
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '1.6px', width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <Sparkline points={series && series.length > 1 ? series : [0, 0]} width={150} height={26} />
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', width: 90, textAlign: 'right' }}>{s.profile ? `${s.profile.flowRateKgPerS.toFixed(2)} kg/s` : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '30px 28px' }}>
          <Label>Runs per recipe</Label>
          <div style={{ marginTop: 18 }}>
            {recipeList.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No recipes.</div>}
            {recipeList.map((r) => (
              <div key={r.id} style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13 }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{r.runs ?? 0}</span>
                </div>
                <div style={{ marginTop: 9, height: 2, background: 'var(--border-color)' }}>
                  <div style={{ height: 2, background: 'var(--text-primary)', width: `${((r.runs ?? 0) / maxRuns) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bridge stats + top-up corrections + tare */}
      <div className="console-grid-seam" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderTop: 'none' }}>
        <div style={{ padding: '30px 28px' }}>
          <Label>Bridge</Label>
          <div style={{ marginTop: 14 }}>
            <InfoRow label="Uptime" value={bridgeStats ? fmtUptime(bridgeStats.startTs) : '—'} />
            <InfoRow label="BLE reconnects" value={bridgeStats ? String(bridgeStats.reconnects) : '—'} />
            <InfoRow label="Scale frames dropped" value={bridgeStats ? `${bridgeStats.dropRatePct} %` : '—'} divider={false} />
          </div>
        </div>

        <div style={{ padding: '30px 28px' }}>
          <Label>Top-up corrections</Label>
          <div style={{ marginTop: 14 }}>
            <InfoRow label="Triggered this week" value={history ? String(history.topUpCount) : '—'} />
            <InfoRow label="Mean shortfall recovered" value={history && history.topUpCount > 0 ? `${history.topUpMeanShortfall.toFixed(3)} kg` : '—'} />
            <InfoRow label="Aborted doses (7 d)" value={String(history?.abortCount ?? 0)} divider={false} />
          </div>
        </div>

        <div style={{ padding: '30px 28px' }}>
          <Label>Predictive stop &amp; scale tare</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <span style={{ fontSize: 40, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: history?.leadNow == null ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
              {history?.leadNow == null ? '—' : history.leadNow.toFixed(2)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>s lead before target</span>
          </div>
          {history && history.leadSeries.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <Sparkline points={history.leadSeries} width={340} height={44} />
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <InfoRow label="Lead trend (last 12)" value={history?.leadTrend == null ? '—' : `${history.leadTrend > 0 ? '+' : ''}${history.leadTrend.toFixed(2)} s`} />
            <InfoRow label="Last tare" value={bridgeStats?.lastTareTs ? new Date(bridgeStats.lastTareTs * 1000).toLocaleString() : '—'} />
            <InfoRow label="Scale offset" value={bridgeStats ? `${bridgeStats.tareOffset.toFixed(2)} kg` : '—'} divider={false} />
          </div>
          {bridgeStats && bridgeStats.tareSeries.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <Sparkline points={bridgeStats.tareSeries} width={340} height={34} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
