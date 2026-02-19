import React, { useState, useEffect } from 'react';
import type { ParsedMenuItem } from '../../entities/Menu';
import { SiloManager } from '../../bluetooth/SiloManager';
import { logger } from '../../utils/logger';

interface SettingsProps {
    siloManager: SiloManager;
    menuItems: ParsedMenuItem[];
    onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsProps> = ({ siloManager, menuItems, onClose }) => {
    const [settings, setSettings] = useState(siloManager.getSettings());
    const [logs, setLogs] = useState<any[]>([]);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        // Subscribe to settings updates from other devices
        const onSettings = (newSettings: any) => {
            setSettings(newSettings);
        };
        siloManager.addSettingsListener(onSettings);

        // Poll logs for the advanced viewer
        const logInterval = setInterval(() => {
            setLogs([...logger.getLogs()].reverse());
        }, 1000);

        return () => {
            siloManager.removeSettingsListener(onSettings);
            clearInterval(logInterval);
        };
    }, [siloManager]);

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
