/**
 * SilosSection — silo inventory + learned profiles (Amokka console).
 *
 * Reads the joined silo model (menu drink + inventory + profile) and writes ONLY
 * through the existing SiloManager APIs (updatePreferences / topUpSilo) and the
 * existing Cropster client — no new inventory logic, no control/IO changes.
 */
import { useEffect, useState } from 'react';
import type { SiloManager } from '../../../bluetooth/SiloManager';
import { cropsterClient, type CropsterLot } from '../../../services/cropster';
import type { SiloInventoryState } from '../../settings/SiloInventory';
import { logger } from '../../../utils/logger';
import { Button, InfoRow, Label } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import { LOW_SILO_KG, type ConsoleSilo } from '../siloModel';

interface SilosSectionProps {
  siloManager: SiloManager;
  silos: ConsoleSilo[];
}

const lineInput = {
  width: '100%',
  padding: '6px 0',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-color)',
  borderRadius: 0,
  fontFamily: 'var(--font-brand)',
  fontSize: 15,
  fontWeight: 300,
  color: 'var(--text-primary)',
  outline: 'none',
} as const;

export function SilosSection({ siloManager, silos }: SilosSectionProps) {
  const [lots, setLots] = useState<CropsterLot[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [topUpForId, setTopUpForId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [fillKg, setFillKg] = useState('5.0');
  const [topUpKg, setTopUpKg] = useState('2.5');
  const [syncing, setSyncing] = useState(false);

  const totalKg = silos.reduce((a, s) => a + (s.currentKg ?? 0), 0);

  useEffect(() => {
    void fetchLots(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLots = async (force: boolean) => {
    setSyncing(true);
    try {
      setLots(await cropsterClient.fetchSiloCandidateLots(force));
    } catch (err) {
      logger.error('Console', 'Cropster fetch failed', err);
    } finally {
      setSyncing(false);
    }
  };

  const renameLot = (siloId: string, name: string) => {
    const inv = { ...(siloManager.getPreferences().inventory || {}) } as Record<string, SiloInventoryState>;
    if (!inv[siloId]) return;
    inv[siloId] = { ...inv[siloId], lotName: name };
    siloManager.updatePreferences({ ...siloManager.getPreferences(), inventory: inv });
  };

  const assignLot = (siloId: string) => {
    const lot = lots.find((l) => l.id === selectedLotId);
    const fill = parseFloat(fillKg);
    if (!lot || isNaN(fill) || fill <= 0) return;
    const inv = { ...(siloManager.getPreferences().inventory || {}) } as Record<string, SiloInventoryState>;
    inv[siloId] = {
      lotId: lot.id,
      lotName: lot.name,
      lotType: lot.type,
      initialFillKg: fill,
      currentCalculatedKg: fill,
      lastAssignedAt: Date.now(),
    };
    siloManager.updatePreferences({ ...siloManager.getPreferences(), inventory: inv });
    logger.info('Console', `Assigned ${lot.name} to ${siloId} (${fill} kg)`);
    setAssignFor(null);
  };

  const confirmTopUp = (siloId: string) => {
    const kg = parseFloat(topUpKg);
    if (isNaN(kg) || kg <= 0) return;
    siloManager.topUpSilo(siloId, kg);
    setTopUpForId(null);
  };

  const filteredLots = lots.filter(
    (l) => l.name.toLowerCase().includes(search.toLowerCase()) || l.id.toLowerCase().includes(search.toLowerCase()),
  );

  const cols = Math.max(1, Math.min(4, silos.length));

  return (
    <section id="silos" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead
        title="Silos & green bean inventory"
        aside={
          <span style={{ display: 'inline-flex', gap: 16, alignItems: 'baseline' }}>
            <span>{`${totalKg.toFixed(1)} kg total`}</span>
            <button
              type="button"
              onClick={() => fetchLots(true)}
              disabled={syncing}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 10, fontWeight: 500, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}
            >
              {syncing ? 'Syncing…' : '↻ Sync Cropster'}
            </button>
          </span>
        }
      />

      {silos.length === 0 ? (
        <div style={{ border: '1px solid var(--border-color)', borderTop: 'none', padding: '48px 28px', color: 'var(--text-secondary)', fontSize: 13 }}>
          No silos — connect to the machine to read its drink list.
        </div>
      ) : (
        <div className="console-grid-seam" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, borderTop: '1px solid var(--border-color)' }}>
          {silos.map((s) => {
            const has = s.currentKg != null && s.initialFillKg != null;
            const pct = has ? Math.min(100, (s.currentKg! / (s.initialFillKg || 1)) * 100) : 0;
            const low = s.currentKg != null && s.currentKg <= LOW_SILO_KG;
            const coast = s.profile?.overshootKg;
            return (
              <div key={s.id} style={{ padding: '28px 24px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px' }}>{s.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: 'var(--text-secondary)' }}>{s.lotId ?? '—'}</span>
                </div>

                {has ? (
                  <input
                    type="text"
                    value={s.lotName}
                    onChange={(e) => renameLot(s.id, e.target.value)}
                    aria-label="Coffee in this silo"
                    style={{ ...lineInput, marginTop: 20 }}
                  />
                ) : (
                  <div style={{ marginTop: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>No lot assigned</div>
                )}

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
                  <span style={{ fontSize: 40, fontWeight: 200, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: low ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                    {s.currentKg != null ? s.currentKg.toFixed(1) : '—'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>kg left</span>
                </div>
                <div style={{ marginTop: 16, height: 3, background: 'var(--border-color)' }}>
                  <div style={{ height: 3, width: `${pct}%`, background: low ? 'var(--color-danger)' : 'var(--text-primary)' }} />
                </div>
                <div style={{ marginTop: 9, fontSize: 11, color: 'var(--text-secondary)' }}>
                  {has ? `Filled ${s.initialFillKg!.toFixed(1)} kg · ${pct.toFixed(0)}% remaining` : 'Assign a lot to track weight'}
                </div>

                <div style={{ marginTop: 26 }}>
                  <Label>Learned profile</Label>
                  <div style={{ marginTop: 10 }}>
                    <InfoRow label="Flow" value={s.profile ? `${s.profile.flowRateKgPerS.toFixed(2)} kg/s` : '—'} />
                    <InfoRow label="Coast-down" value={coast != null ? `${coast.toFixed(3)} kg` : '—'} />
                    <InfoRow label="Doses" value={s.profile ? String(s.profile.totalDoses) : '0'} divider={false} />
                  </div>
                </div>

                {topUpForId === s.id && (
                  <div style={{ marginTop: 22, padding: 16, background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
                    <Label>Add to silo</Label>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={topUpKg}
                        onChange={(e) => setTopUpKg(e.target.value.replace(/[^0-9.]/g, ''))}
                        aria-label="Kilograms to add"
                        style={{ ...lineInput, textAlign: 'right', fontSize: 26, fontWeight: 200, width: 90 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>kg</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <Button onClick={() => confirmTopUp(s.id)}>Add</Button>
                      <Button variant="ghost" onClick={() => setTopUpForId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {assignFor === s.id && (
                  <div style={{ marginTop: 22, padding: 16, background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
                    <Label>Assign Cropster lot</Label>
                    <input
                      type="text"
                      placeholder="Search lots…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ ...lineInput, marginTop: 12, fontSize: 13 }}
                    />
                    <select
                      value={selectedLotId}
                      onChange={(e) => setSelectedLotId(e.target.value)}
                      style={{ ...lineInput, marginTop: 12, fontSize: 13 }}
                    >
                      <option value="">— Lot —</option>
                      {filteredLots.map((l) => (
                        <option key={l.id} value={l.id}>{l.name} [{l.id}]</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
                      <span style={{ fontSize: 11, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Initial</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fillKg}
                        onChange={(e) => setFillKg(e.target.value.replace(/[^0-9.]/g, ''))}
                        aria-label="Initial fill kilograms"
                        style={{ ...lineInput, textAlign: 'right', width: 80 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>kg</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <Button onClick={() => assignLot(s.id)}>Save</Button>
                      <Button variant="ghost" onClick={() => setAssignFor(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {assignFor !== s.id && topUpForId !== s.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
                    {has && (
                      <Button variant="ghost" onClick={() => { setTopUpForId(s.id); setTopUpKg('2.5'); }}>Top up</Button>
                    )}
                    <Button variant="ghost" onClick={() => { setAssignFor(s.id); setSelectedLotId(''); setSearch(''); setFillKg('5.0'); void fetchLots(false); }}>
                      {has ? 'Reassign lot' : 'Assign lot'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
