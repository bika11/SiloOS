/**
 * ConsoleShell — the Amokka SiloOS Console shell: sticky header (status chips,
 * anchor nav with scroll-spy, hold-to-abort E-stop) over the six sections.
 *
 * Control note: the E-stop reuses the existing abort path (siloManager.abortAll
 * + connection.cancelOrder) — the same one DashboardScreen uses. No new control.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TopBrewerConnection } from '../../bluetooth';
import type { ScaleManager } from '../../bluetooth/ScaleManager';
import type { SiloManager } from '../../bluetooth/SiloManager';
import type { ParsedMenuItem } from '../../entities/Menu';
import { logger } from '../../utils/logger';
import { StatusDot } from '../../components/amokka';
import { useConnectionStatus, useDoseHistory, useDoseParams, useHopperWeight, useLearnedProfiles, useLiveDose, useScaleFeed, useSettings } from './useConsoleData';
import { useSilos } from './siloModel';
import { useDoseRunner } from './useDoseRunner';
import { LiveSection } from './sections/LiveSection';
import { SilosSection } from './sections/SilosSection';
import { RecipesSection } from './sections/RecipesSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { PrecisionSection } from './sections/PrecisionSection';
import { SettingsSection } from './sections/SettingsSection';
import './console.css';

interface ConsoleShellProps {
  connection: TopBrewerConnection | null;
  scaleManager: ScaleManager;
  siloManager: SiloManager;
  menuItems: ParsedMenuItem[];
  onExitToClassic?: () => void;
}

const NAV = [
  { id: 'live', label: 'Live' },
  { id: 'silos', label: 'Silos' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'performance', label: 'Performance' },
  { id: 'precision', label: 'Precision' },
  { id: 'settings', label: 'Settings' },
];

const HOLD_MS = 2000;
const TICK_MS = 50;

export function ConsoleShell({ connection, siloManager, menuItems, onExitToClassic }: ConsoleShellProps) {
  const { bridgeConnected, machineConnected } = useConnectionStatus(siloManager);
  const scaleStatus = useScaleFeed(siloManager);
  const hopperWeight = useHopperWeight(siloManager);
  const dose = useLiveDose(siloManager);
  const settings = useSettings(siloManager);
  const learnedProfiles = useLearnedProfiles(siloManager);
  const doseParams = useDoseParams(siloManager);
  const doseHistory = useDoseHistory(siloManager);
  const hidden = (settings.hidden_recipes as number[]) ?? [];
  const hiddenKey = hidden.join(',');
  const visibleItems = useMemo(
    () => menuItems.filter((i) => !hidden.includes(i.id)),
    // hiddenKey captures hidden contents; menuItems identity is stable per menu sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuItems, hiddenKey],
  );
  const silos = useSilos(siloManager, visibleItems, learnedProfiles);
  const runner = useDoseRunner(siloManager, connection);

  const live = dose.active || runner.busy;

  // --- Scroll-spy ---
  const [activeNav, setActiveNav] = useState('live');
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = NAV.map((n) => root.querySelector(`#${n.id}`)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveNav(visible[0].target.id);
      },
      { root, rootMargin: '-120px 0px -60% 0px', threshold: [0, 0.25, 0.5] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [silos.length]);

  // --- Hold-to-abort E-stop (reused pattern from DashboardScreen) ---
  const [hold, setHold] = useState(0);
  const holdTimer = useRef<number | null>(null);
  const holdVal = useRef(0);

  const fireEstop = () => {
    logger.warn('Console', 'EMERGENCY STOP TRIGGERED');
    siloManager.abortAll('Emergency Stop');
    connection?.cancelOrder().catch(() => {});
  };
  const stopHold = () => {
    if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
    holdVal.current = 0;
    setHold(0);
  };
  const startHold = () => {
    if (!live) return;
    holdVal.current = 0;
    setHold(0);
    holdTimer.current = window.setInterval(() => {
      holdVal.current += (TICK_MS / HOLD_MS) * 100;
      if (holdVal.current >= 100) {
        stopHold();
        fireEstop();
      } else {
        setHold(holdVal.current);
      }
    }, TICK_MS);
  };
  useEffect(() => () => { if (holdTimer.current) clearInterval(holdTimer.current); }, []);

  const machineLabel = !machineConnected ? 'Offline' : live ? (dose.state[0].toUpperCase() + dose.state.slice(1)) : 'Ready';

  const chipLabel = (label: string) => (
    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</span>
  );

  return (
    <div className="console-root" ref={rootRef}>
      {/* Banners (kept from the classic shell) */}
      {!bridgeConnected && (
        <div role="alert" style={{ background: 'var(--color-danger)', color: '#fff', textAlign: 'center', padding: '0.6rem 1rem', fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Bridge offline — reconnecting…
        </div>
      )}
      {bridgeConnected && scaleStatus === 'stale' && (
        <div role="alert" style={{ background: 'var(--amokka-grinder)', color: '#fff', textAlign: 'center', padding: '0.6rem 1rem', fontSize: 12, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Scale signal lost — dosing is unsafe until it returns
        </div>
      )}

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 28px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: '3px' }}>SILOOS</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.4px' }}>Green coffee silo gateway</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {chipLabel('Bridge')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot state={bridgeConnected ? 'connected' : 'error'} />
                <span style={{ fontSize: 13 }}>{bridgeConnected ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {chipLabel('Machine')}
              <span style={{ fontSize: 13 }}>{machineLabel}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {chipLabel('Hopper')}
              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{hopperWeight.toFixed(1)} kg</span>
            </div>
            {live && (
              <button
                type="button"
                onMouseDown={startHold}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                onTouchStart={(e) => { e.preventDefault(); startHold(); }}
                onTouchEnd={stopHold}
                style={{ position: 'relative', overflow: 'hidden', height: 44, padding: '0 22px', background: 'transparent', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--danger-text)' }}
              >
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--color-danger)', opacity: 0.55, width: `${hold}%`, transition: 'width 60ms linear' }} />
                <span style={{ position: 'relative' }}>{hold > 0 ? 'Keep holding' : 'Emergency stop'}</span>
              </button>
            )}
            {onExitToClassic && (
              <button type="button" onClick={onExitToClassic} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-brand)', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                Classic
              </button>
            )}
          </div>
        </div>
        <nav style={{ maxWidth: 1360, margin: '0 auto', padding: '0 28px 14px', display: 'flex', gap: 30 }}>
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: activeNav === n.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="console-inner">
        <LiveSection
          silos={silos}
          hopperWeight={hopperWeight}
          scaleStale={scaleStatus === 'stale'}
          dose={dose}
          runner={runner}
        />

        <SilosSection siloManager={siloManager} silos={silos} />

        <RecipesSection siloManager={siloManager} silos={silos} runner={runner} />

        <PerformanceSection silos={silos} history={doseHistory} />

        <PrecisionSection siloManager={siloManager} silos={silos} doseParams={doseParams} />

        <SettingsSection siloManager={siloManager} menuItems={menuItems} settings={settings} />
      </div>
    </div>
  );
}
