/**
 * LiveSection — the operating heart of the console.
 *
 * Idle: pick a silo (machine drink), set a target in kg, Start dose.
 * Live: BrewRing + phase bars + telemetry, driven read-only by the bridge
 * dose stream; Abort routes through the existing RecipeRunner/global-abort.
 *
 * The dispense itself is the UNMODIFIED production handshake (RecipeRunner via
 * useDoseRunner) — this file only presents it.
 */
import { useState } from 'react';
import { BrewRing, Button, InfoRow, Label, SignalBars, StatusDot, Stepper } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import { HOPPER_CAP_KG, LOW_SILO_KG, MAX_TARGET_KG, type ConsoleSilo } from '../siloModel';
import type { LiveDose } from '../useConsoleData';
import type { DoseRunnerApi } from '../useDoseRunner';

interface LiveSectionProps {
  silos: ConsoleSilo[];
  hopperWeight: number;
  scaleStale: boolean;
  dose: LiveDose;
  runner: DoseRunnerApi;
}

const PHASE_LABELS: Record<string, string> = {
  armed: 'Armed',
  running: 'Dispensing',
  stopping: 'Valve closing',
  settling: 'Settling',
  done: 'Complete',
  aborted: 'Aborted',
};
const PHASE_ORDER = ['armed', 'running', 'stopping', 'settling', 'done'];

function stateLabel(state: LiveDose['state'], active: boolean): string {
  if (!active && state === 'done') return 'Ready';
  return PHASE_LABELS[state] ?? 'Ready';
}

export function LiveSection({ silos, hopperWeight, scaleStale, dose, runner }: LiveSectionProps) {
  const [selectedId, setSelectedId] = useState<string>(silos[0]?.id ?? '');
  const [target, setTarget] = useState<number>(12);

  const live = dose.active || runner.busy;
  const selected = silos.find((s) => s.id === selectedId) ?? silos[0];
  const flow = selected?.profile?.flowRateKgPerS || 0.7;
  const etaS = flow > 0 ? Math.round(target / flow) : 0;

  const hopperPct = Math.min(100, (hopperWeight / HOPPER_CAP_KG) * 100);
  const progress = dose.targetKg > 0 ? Math.min(1, dose.dispensedKg / dose.targetKg) : 0;
  const ringState = dose.state === 'aborted' ? 'error' : dose.state === 'done' && !dose.active ? 'done' : 'brewing';

  const canDose = !!selected && !live && !scaleStale;

  return (
    <section id="live" className="console-section" style={{ paddingTop: 48 }}>
      <SectionHead
        title="Live dose"
        aside={`Scale feed ${scaleStale ? 'lost' : '10 Hz'} · ${live ? 'dosing' : 'idle'}`}
      />

      <div
        className="console-grid-seam"
        style={{ gridTemplateColumns: '1fr 360px' }}
      >
        {/* Main pane */}
        <div style={{ padding: '40px 40px 36px' }}>
          {live ? (
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 48, alignItems: 'start' }}>
              <BrewRing state={ringState} progress={progress} statusText={stateLabel(dose.state, dose.active)} size={240} />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 84, fontWeight: 200, letterSpacing: '-2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {dose.dispensedKg.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 18, color: 'var(--text-secondary)' }}>kg</span>
                  {dose.targetKg > 0 && (
                    <span style={{ fontSize: 16, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      / {dose.targetKg.toFixed(1)} kg target
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {dose.siloId ? `Silo ${dose.siloId}` : ''}
                </div>

                {/* Phase bars */}
                <div style={{ display: 'flex', gap: 6, marginTop: 32 }}>
                  {PHASE_ORDER.map((k) => {
                    const idx = PHASE_ORDER.indexOf(dose.state === 'aborted' ? 'done' : dose.state);
                    const done = PHASE_ORDER.indexOf(k) <= idx;
                    return (
                      <div key={k} style={{ flex: 1 }}>
                        <div style={{ height: 2, background: done ? 'var(--text-primary)' : 'var(--border-color)' }} />
                        <div
                          style={{
                            marginTop: 9,
                            fontSize: 10,
                            fontWeight: 500,
                            letterSpacing: '1.6px',
                            textTransform: 'uppercase',
                            color: done ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          }}
                        >
                          {PHASE_LABELS[k]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginTop: 34 }}>
                  <InfoRow label="Flow rate" value={`${dose.flowRateKgPerS.toFixed(3)} kg/s`} />
                  <InfoRow label="Progress" value={`${Math.round(progress * 100)} %`} />
                  <InfoRow label="Target" value={`${dose.targetKg.toFixed(1)} kg`} />
                  <InfoRow label="Source" value="Pi loop · dose_controller" divider={false} />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                  <Button variant="danger" block={false} onClick={runner.abort}>Abort dose</Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ fontSize: 56, fontWeight: 200, letterSpacing: '-1px', lineHeight: 1 }}>Ready</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460 }}>
                Pick a silo, set a target in kilograms and start. The Pi loop stops early by the learned coast-down so the settled weight lands on target.
              </div>

              {/* Silo picker */}
              <div
                className="console-grid-seam"
                style={{ marginTop: 44, gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, silos.length))}, minmax(0, 1fr))`, borderTop: '1px solid var(--border-color)' }}
              >
                {silos.slice(0, 8).map((s) => {
                  const selectedCell = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      style={{
                        textAlign: 'left',
                        background: selectedCell ? 'var(--surface)' : 'var(--bg)',
                        border: 'none',
                        padding: '18px 18px 16px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-brand)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px' }}>{s.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {s.currentKg != null ? `${s.currentKg.toFixed(1)} kg` : '—'}
                        </span>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.lotName || 'No lot assigned'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Target + start */}
              <div style={{ marginTop: 32, display: 'flex', alignItems: 'flex-end', gap: 40, flexWrap: 'wrap' }}>
                <div>
                  <Label>Target weight</Label>
                  <div style={{ marginTop: 10 }}>
                    <Stepper
                      aria-label="Target weight in kilograms"
                      unit="kg"
                      min={0.5}
                      max={MAX_TARGET_KG}
                      step={0.5}
                      value={target}
                      onChange={setTarget}
                      decimalPlaces={1}
                    />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 220, maxWidth: 260 }}>
                  <Button onClick={() => selected && runner.startDose(selected, target)} disabled={!canDose}>
                    Start dose
                  </Button>
                </div>
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {scaleStale ? 'Scale signal lost — dosing disabled' : `Estimated ${etaS} s at the learned flow rate`}
                  </div>
                </div>
              </div>

              {runner.message && (
                <div role="alert" style={{ marginTop: 20, padding: '12px 16px', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', color: 'var(--danger-text)', fontSize: 13 }}>
                  {runner.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div style={{ padding: '32px 28px' }}>
          <Label>Hopper</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 46, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {hopperWeight.toFixed(1)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>kg gross</span>
          </div>
          <div style={{ marginTop: 16, height: 3, background: 'var(--border-color)' }}>
            <div style={{ height: 3, width: `${hopperPct}%`, background: hopperWeight >= HOPPER_CAP_KG ? 'var(--color-danger)' : 'var(--text-primary)' }} />
          </div>
          <div style={{ marginTop: 9, fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.4px' }}>
            Cap {HOPPER_CAP_KG} kg · hard abort at gross
          </div>

          <div style={{ marginTop: 34 }}>
            <Label>Last dose</Label>
            <div style={{ marginTop: 14 }}>
              <InfoRow label="Silo" value={dose.siloId || '—'} />
              <InfoRow label="Target" value={dose.lastResult ? `${dose.lastResult.targetKg.toFixed(1)} kg` : '—'} />
              <InfoRow label="Actual" value={dose.lastResult ? `${dose.lastResult.actualKg.toFixed(1)} kg` : '—'} />
              <InfoRow
                label="Error"
                value={dose.lastResult ? `${dose.lastResult.overshootKg > 0 ? '+' : ''}${dose.lastResult.overshootKg.toFixed(2)} kg` : '—'}
                divider={false}
              />
            </div>
          </div>

          <div style={{ marginTop: 34 }}>
            <Label>Links</Label>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusDot state="connected" />
                  <span style={{ fontSize: 13 }}>TopBrewer BLE</span>
                </div>
                <SignalBars level={3} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusDot state={scaleStale ? 'error' : 'connected'} />
                  <span style={{ fontSize: 13 }}>Laumas TLS485 scale</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '1px' }}>RS485</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Low-silo hint for the selected silo */}
      {!live && selected?.currentKg != null && selected.currentKg <= LOW_SILO_KG && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--danger-text)' }}>
          {selected.title} is low ({selected.currentKg.toFixed(1)} kg left) — top up in Silos.
        </div>
      )}
    </section>
  );
}
