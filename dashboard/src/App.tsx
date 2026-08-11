import { useState, useEffect, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { TopBrewerConnection } from './bluetooth';
import { DiscoveryScreen } from './features/discovery/DiscoveryScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ConsoleShell } from './features/console/ConsoleShell';
import { ScaleManager } from './bluetooth/ScaleManager';
import { SiloManager } from './bluetooth/SiloManager';
import { logger } from './utils/logger';
import type { ParsedMenuItem } from './entities/Menu';
import './App.css';
import './features.css'; // Ensure feature styles are loaded

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('App', 'Runtime Error', error);
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', backgroundColor: '#330000', height: '100vh' }}>
          <h1>SiloOS Dashboard Crashed</h1>
          <pre>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: 10, marginTop: 20 }}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [connection, setConnection] = useState<TopBrewerConnection | null>(null);
  const [scaleManager] = useState(() => new ScaleManager());
  const [siloManager] = useState(() => {
    const sm = new SiloManager();
    (window as any).siloManager = sm; // Expose for RemoteBLEAdapter
    return sm;
  });
  const [isSupported, setIsSupported] = useState(true);
  const [appState, setAppState] = useState<'discovery' | 'dashboard' | 'settings' | 'console'>('dashboard');
  const [menuItems, setMenuItems] = useState<ParsedMenuItem[]>([]);
  const [settings, setSettings] = useState(siloManager.getSettings());
  const [bridgeConnected, setBridgeConnected] = useState(siloManager.isBridgeConnected());
  const [scaleStale, setScaleStale] = useState(siloManager.getScaleStatus() === 'stale');

  // Subscribe the app shell to live connection + scale-feed changes so the
  // status indicator and banners react in real time (the old code read the
  // connection flag once at render and could show "online" long after a drop).
  useEffect(() => {
    const onConn = (c: boolean) => setBridgeConnected(c);
    const onScale = (s: 'ok' | 'stale') => setScaleStale(s === 'stale');
    siloManager.addConnectionListener(onConn);
    siloManager.addScaleStatusListener(onScale);
    return () => {
      siloManager.removeConnectionListener(onConn);
      siloManager.removeScaleStatusListener(onScale);
    };
  }, [siloManager]);

  useEffect(() => {
    // SiloOS Dashboard Specialization: Auto-connect to native gateway
    setIsSupported(true); // Remote is always supported

    // Sync settings from siloManager
    const onSettings = (newSettings: any) => {
      setSettings(newSettings);
      if (newSettings.theme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
    };
    siloManager.addSettingsListener(onSettings);

    // Initial check for theme
    if (siloManager.getSettings().theme === 'light') {
      document.body.classList.add('light-theme');
    }

    // Auto-connect to the machine via Pi
    const conn = new TopBrewerConnection(undefined, true);
    setConnection(conn);

    // Note: The actual BLE connection happens on the Pi.
    // We just need to tell the connection object to "connect" to our relay.
    conn.connect().then(success => {
      if (success) {
        conn.requestMenu();
      }
    });

    // Subscribe to menu updates centrally
    conn.events.onMenuReceived = (items) => {
      setMenuItems(items);
    };

    return () => {
      conn.events.onMenuReceived = undefined;
      siloManager.removeSettingsListener(onSettings);
    };
  }, [siloManager]);

  // Theme Sync Effect
  useEffect(() => {
    if (settings.theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [settings.theme]);

  const handleConnect = (conn: TopBrewerConnection) => {
    setConnection(conn);
    setAppState('dashboard');
  };

  const handleDisconnect = async () => {
    if (connection) {
      await connection.disconnect();
      setConnection(null);
    }
    setAppState('discovery');
  };

  return (
    <ErrorBoundary>
      <div className={`app-container ${settings.theme}-theme`}>
        {appState === 'discovery' && (
          <DiscoveryScreen onConnect={handleConnect} isSupported={isSupported} />
        )}

        {appState === 'console' && (
          <ConsoleShell
            connection={connection}
            scaleManager={scaleManager}
            siloManager={siloManager}
            menuItems={menuItems}
            onExitToClassic={() => setAppState('dashboard')}
          />
        )}

        {(appState === 'dashboard' || appState === 'settings') && (
          <div className="screen dashboard-screen">
            {!bridgeConnected && (
              <div
                role="alert"
                style={{
                  background: '#c0121b', color: '#fff', fontWeight: 800,
                  textAlign: 'center', padding: '0.6rem 1rem', letterSpacing: '0.04em',
                }}
              >
                ⚠ BRIDGE OFFLINE — reconnecting…
              </div>
            )}
            {bridgeConnected && scaleStale && (
              <div
                role="alert"
                style={{
                  background: '#b8860b', color: '#fff', fontWeight: 800,
                  textAlign: 'center', padding: '0.6rem 1rem', letterSpacing: '0.04em',
                }}
              >
                ⚠ SCALE SIGNAL LOST — dosing is unsafe until it returns
              </div>
            )}
            <header className="header">
              <div className="flex items-center gap-3">
                <h1>SiloOS Live Dashboard</h1>
                <div
                  className={`status-led ${bridgeConnected ? 'online' : 'offline'}`}
                  title={bridgeConnected ? 'Bridge Online' : 'Bridge Offline'}
                  role="status"
                  aria-label={bridgeConnected ? 'Bridge online' : 'Bridge offline'}
                ></div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  aria-label="Open new Console UI"
                  onClick={() => setAppState('console')}
                >
                  Console
                </button>
                <button
                  className="btn-secondary"
                  aria-label={appState === 'settings' ? 'Back to Dashboard' : 'Open Settings'}
                  onClick={() => setAppState(appState === 'settings' ? 'dashboard' : 'settings')}
                >
                  {appState === 'settings' ? 'Back' : 'Settings'}
                </button>
                {connection && (
                  <>
                    <button className="btn-secondary" onClick={() => logger.downloadLogs()}>
                      Download Logs
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        if (window.confirm('Disconnect from TopBrewer?')) {
                          handleDisconnect();
                        }
                      }}
                    >
                      Exit
                    </button>
                  </>
                )}
                {!connection && (
                  <button className="btn btn-primary" onClick={() => {
                    const conn = new TopBrewerConnection(undefined, true);
                    conn.connect().then(success => {
                      if (success) setConnection(conn);
                    });
                  }}>
                    Connect
                  </button>
                )}
              </div>
            </header>

            {appState === 'dashboard' && (
              <DashboardScreen
                connection={connection}
                scaleManager={scaleManager}
                siloManager={siloManager}
                menuItems={menuItems}
                hiddenRecipes={settings.hidden_recipes || []}
              />
            )}

            {appState === 'settings' && (
              <SettingsScreen
                siloManager={siloManager}
                menuItems={menuItems}
                onClose={() => setAppState('dashboard')}
              />
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
