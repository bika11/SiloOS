import React, { useState, useEffect, useCallback } from 'react';
import type { ParsedMenuItem } from '../../entities/Menu';
import { SiloManager } from '../../bluetooth/SiloManager';
import { Stepper } from '../../components/ui/Stepper';
import type { SiloProfile } from '../dosing/DoseController';
import { logger } from '../../utils/logger';

interface SettingsProps {
    siloManager: SiloManager;
    menuItems: ParsedMenuItem[];
    onClose: () => void;
}

/** Default profile values (must match DoseController DEFAULT_PROFILE) */
const DEFAULT_FLOW = 0.05;
const DEFAULT_DELAY = 0.5;

export const SettingsScreen: React.FC<SettingsProps> = ({ siloManager, menuItems, onClose }) => {
    const [settings, setSettings] = useState(siloManager.getSettings());
    const [logs, setLogs] = useState<any[]>([]);
    const [filter, setFilter] = useState('');
    const [dosingOpen, setDosingOpen] = useState(false);
    const [profiles, setProfiles] = useState<Record<string, SiloProfile>>(
        siloManager.getProfiles() as Record<string, SiloProfile>
    );

    useEffect(() => {
        const onSettings = (newSettings: any) => {
            setSettings(newSettings);
        };
        siloManager.addSettingsListener(onSettings);

        const logInterval = setInterval(() => {
            setLogs([...logger.getLogs()].reverse());
        }, 1000);

        return () => {
            siloManager.removeSettingsListener(onSettings);
            clearInterval(logInterval);
        };
    }, [siloManager]);

    // Refresh profiles when section opens
    useEffect(() => {
        if (dosingOpen) {
            setProfiles(siloManager.getProfiles() as Record<string, SiloProfile>);
        }
    }, [dosingOpen, siloManager]);

    const handleThemeToggle = () => {
        const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
        const newSettings = { ...settings, theme: newTheme };
        setSettings(newSettings);
        siloManager.updateSettings({ theme: newTheme });
    };

    const toggleRecipeVisibility = (recipeId: number) => {
        const hidden = settings.hidden_recipes || [];
        const newHidden = hidden.includes(recipeId)
            ? hidden.filter((id: number) => id !== recipeId)
            : [...hidden, recipeId];

        const newSettings = { ...settings, hidden_recipes: newHidden };
        setSettings(newSettings);
        siloManager.updateSettings({ hidden_recipes: newHidden });
    };

    // --- Dosing Calibration Handlers ---

    const updateProfileField = useCallback((siloId: string, field: keyof SiloProfile, value: any) => {
        setProfiles(prev => {
            const updated = {
                ...prev,
                [siloId]: { ...prev[siloId], [field]: value }
            };
            siloManager.updateProfiles({ [siloId]: updated[siloId] });
            logger.info('Settings', `Updated ${siloId}.${field} = ${value}`);
            return updated;
        });
    }, [siloManager]);

    const resetProfile = useCallback((siloId: string) => {
        const fresh: SiloProfile = {
            flowRateKgPerS: DEFAULT_FLOW,
            valveDelayS: DEFAULT_DELAY,
            totalDoses: 0,
            recentOvershootsKg: [],
        };
        setProfiles(prev => {
            const updated = { ...prev, [siloId]: fresh };
            siloManager.updateProfiles({ [siloId]: fresh });
            logger.warn('Settings', `Profile RESET for silo "${siloId}"`);
            return updated;
        });
    }, [siloManager]);

    const profileEntries = Object.entries(profiles).filter(
        ([, p]) => p && typeof p.flowRateKgPerS === 'number'
    );

    return (
        <div className="settings-screen glass">
            <header className="settings-header">
                <h2>Industrial Settings</h2>
                <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </header>

            <div className="settings-content">
                <section className="settings-section">
                    <h3>Theme Control</h3>
                    <div className="flex items-center justify-between p-4 glass rounded-lg">
                        <span>Current Theme: <strong className="uppercase">{settings.theme}</strong></span>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={settings.theme === 'light'}
                                onChange={handleThemeToggle}
                            />
                            <span className="switch-slider"></span>
                        </label>
                    </div>
                </section>

                <section className="settings-section">
                    <h3>Recipe Visibility</h3>
                    <div className="recipe-list glass rounded-lg overflow-hidden">
                        {menuItems.map(item => (
                            <div key={item.id} className="recipe-item p-3 border-b border-white/5">
                                <span className={settings.hidden_recipes?.includes(item.id) ? 'text-zinc-500 line-through' : ''}>
                                    {item.id}. {item.name}
                                </span>
                                <div className="flex justify-end">
                                    <input
                                        type="checkbox"
                                        className="industrial-checkbox"
                                        checked={!settings.hidden_recipes?.includes(item.id)}
                                        onChange={() => toggleRecipeVisibility(item.id)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* --- Dosing Calibration (collapsible) --- */}
                <section className="settings-section">
                    <button
                        className="dosing-toggle"
                        onClick={() => setDosingOpen(!dosingOpen)}
                    >
                        <h3 style={{ margin: 0 }}>Dosing Calibration</h3>
                        <span className={`dosing-chevron ${dosingOpen ? 'open' : ''}`}>▶</span>
                    </button>

                    {dosingOpen && (
                        <div className="dosing-calibration-content">
                            <div className="dosing-help-text">
                                <p><strong>When to use:</strong> After running a few gravimetric doses, check the overshoot chips below. If they're consistently red, adjust these values.</p>
                                <p><strong>Valve Delay</strong> — How long product keeps flowing after the valve closes. Increase if doses consistently overshoot.</p>
                                <p><strong>Flow Rate</strong> — How fast product flows (kg per second). Set this before the first dose if you know it, or let the system learn automatically.</p>
                                <p><strong>Reset Profile</strong> — Clears all learned data. Use after changing product, moving the scale, or if the system behaves erratically.</p>
                            </div>
                            {profileEntries.length === 0 ? (
                                <div className="p-4 glass rounded-lg text-zinc-500 font-mono text-sm">
                                    No silo profiles yet — run a gravimetric dose first.
                                </div>
                            ) : (
                                profileEntries.map(([siloId, profile]) => (
                                    <div key={siloId} className="dosing-silo-card glass rounded-lg">
                                        <div className="dosing-silo-header">
                                            <span className="dosing-silo-name">{siloId}</span>
                                            <span className="dosing-dose-count">
                                                {profile.totalDoses} dose{profile.totalDoses !== 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        <div className="dosing-steppers">
                                            <Stepper
                                                label="VALVE DELAY"
                                                unit="s"
                                                min={0}
                                                max={5}
                                                step={0.1}
                                                value={profile.valveDelayS}
                                                onChange={(v) => updateProfileField(siloId, 'valveDelayS', v)}
                                                decimalPlaces={1}
                                            />
                                            <Stepper
                                                label="FLOW RATE"
                                                unit="kg/s"
                                                min={0.01}
                                                max={1.0}
                                                step={0.01}
                                                value={profile.flowRateKgPerS}
                                                onChange={(v) => updateProfileField(siloId, 'flowRateKgPerS', v)}
                                                decimalPlaces={2}
                                            />
                                        </div>

                                        {/* Overshoot History */}
                                        {profile.recentOvershootsKg?.length > 0 && (
                                            <div className="dosing-overshoot-section">
                                                <span className="dosing-overshoot-label">RECENT OVERSHOOT</span>
                                                <div className="dosing-overshoot-chips">
                                                    {profile.recentOvershootsKg.map((ov, i) => {
                                                        const cls = Math.abs(ov) <= 0.1 ? 'good'
                                                            : Math.abs(ov) <= 0.2 ? 'warn' : 'bad';
                                                        return (
                                                            <span key={i} className={`overshoot-chip ${cls}`}>
                                                                {ov > 0 ? '+' : ''}{(ov * 1000).toFixed(0)}g
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            className="btn btn-secondary dosing-reset-btn"
                                            onClick={() => {
                                                if (confirm(`Reset profile for "${siloId}"? This clears all learned data.`)) {
                                                    resetProfile(siloId);
                                                }
                                            }}
                                        >
                                            ↺ RESET PROFILE
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </section>

                <section className="settings-section flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-2">
                        <h3>System Logs</h3>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Filter logs..."
                                className="log-filter-input"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                            <button className="btn-secondary text-xs py-1 px-3" onClick={() => logger.downloadLogs()}>
                                Export
                            </button>
                        </div>
                    </div>
                    <div className="advanced-log-viewer glass rounded-lg flex-1 overflow-auto p-4 font-mono text-xs text-left">
                        {logs
                            .filter(log =>
                                !filter ||
                                log.tag.toLowerCase().includes(filter.toLowerCase()) ||
                                log.message.toLowerCase().includes(filter.toLowerCase())
                            )
                            .map((log, i) => (
                                <div key={i} className={`log-entry level-${log.level} mb-1 border-b border-white/5 pb-1`}>
                                    <span className="text-zinc-500">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                                    <span className="text-amber mx-2">[{log.tag}]</span>
                                    <span>{log.message}</span>
                                    {log.hex && <div className="text-zinc-600 mt-1 ml-4 break-all opacity-50">HEX: {log.hex}</div>}
                                </div>
                            ))}
                    </div>
                </section>
            </div>
        </div>
    );
};
