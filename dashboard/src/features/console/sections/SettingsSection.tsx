/**
 * SettingsSection — bridge info (read-only), theme, and machine-recipe
 * visibility. Writes go only through the existing updateSettings (theme,
 * hidden_recipes). Behaviour toggles that map to fixed dose behaviours are
 * shown but marked as landing with the Phase 5 backend — no fake controls.
 */
import type { SiloManager } from '../../../bluetooth/SiloManager';
import type { TopBrewerConnection } from '../../../bluetooth';
import type { ParsedMenuItem } from '../../../entities/Menu';
import { Button, InfoRow, Label, Switch } from '../../../components/amokka';
import { SectionHead } from '../sectionParts';
import { logger } from '../../../utils/logger';

/** App version shown in Settings. Bridge sha is appended once Batch B exposes it. */
const CONSOLE_VERSION = 'SiloOS Console · v1.4.0';

interface SettingsSectionProps {
  siloManager: SiloManager;
  connection: TopBrewerConnection | null;
  menuItems: ParsedMenuItem[];
  settings: Record<string, unknown>;
}

const BEHAVIOURS = [
  { label: 'Scaled top-up correction', help: 'Re-request the missing fraction when a dose falls short.' },
  { label: 'Require hold to abort', help: 'Emergency stop needs a two-second press.' },
  { label: 'Tare before every dose', help: 'Zero the hopper reading at arm time.' },
];

export function SettingsSection({ siloManager, connection, menuItems, settings }: SettingsSectionProps) {
  const theme = (settings.theme as string) ?? 'dark';
  const hidden = (settings.hidden_recipes as number[]) ?? [];
  const host = `${window.location.hostname}:8765`;

  const toggleTheme = () => siloManager.updateSettings({ theme: theme === 'light' ? 'dark' : 'light' });
  const toggleVisible = (id: number) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    siloManager.updateSettings({ hidden_recipes: next });
  };

  return (
    <section id="settings" className="console-section" style={{ paddingTop: 72 }}>
      <SectionHead title="Settings" aside={CONSOLE_VERSION} />

      <div className="console-grid-seam" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid var(--border-color)' }}>
        {/* Bridge */}
        <div style={{ padding: '30px 28px' }}>
          <Label>Bridge</Label>
          <div style={{ marginTop: 14 }}>
            <InfoRow label="Host" value={host} />
            <InfoRow label="Machine" value="TopBrewer · BLE relay" />
            <InfoRow label="Scale" value="Laumas TLS485 · RS485" />
            <InfoRow label="Auth token" value="•••• (env)" divider={false} />
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={() => connection?.requestMenu()} disabled={!connection}>Rescan</Button>
            <Button variant="ghost" onClick={() => logger.downloadLogs()}>Logs</Button>
          </div>
          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 14 }}>Light theme</div>
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)' }}>The console is designed dark; light is best-effort.</div>
            </div>
            <Switch checked={theme === 'light'} onChange={toggleTheme} aria-label="Toggle light theme" />
          </div>
        </div>

        {/* Behaviour (informational until Phase 5) */}
        <div style={{ padding: '30px 28px' }}>
          <Label>Behaviour</Label>
          <div style={{ marginTop: 12 }}>
            {BEHAVIOURS.map((b) => (
              <div key={b.label} style={{ padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 14 }}>{b.label}</div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.help}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            These are currently fixed in the dose flow. Making them configurable is part of the Phase 5 backend work (they are shown here so the surface is complete, not as live toggles).
          </div>
        </div>

        {/* Recipe visibility */}
        <div style={{ padding: '30px 28px' }}>
          <Label>Machine recipes · visibility</Label>
          <div style={{ marginTop: 12 }}>
            {menuItems.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No machine recipes read yet.</div>}
            {menuItems.map((item) => {
              const visible = !hidden.includes(item.id);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '15px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 14, color: visible ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{item.name}</span>
                  <Switch checked={visible} onChange={() => toggleVisible(item.id)} aria-label={`Show ${item.name}`} />
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Hiding a recipe drops it from the operator lists but leaves it on the machine. Syncs to every connected client.
          </div>
        </div>
      </div>
    </section>
  );
}
