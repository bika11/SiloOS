import { useState, useEffect } from 'react';
import { TopBrewerConnection } from './bluetooth';
import { DiscoveryScreen } from './features/discovery/DiscoveryScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { ScaleManager } from './bluetooth/ScaleManager';
import { SiloManager } from './bluetooth/SiloManager';
import { logger } from './utils/logger';
import './App.css';

function App() {
  const [connection, setConnection] = useState<TopBrewerConnection | null>(null);
  const [scaleManager] = useState(() => new ScaleManager());
  const [siloManager] = useState(() => {
    const sm = new SiloManager();
    (window as any).siloManager = sm; // Expose for RemoteBLEAdapter
    return sm;
  });
  const [isSupported, setIsSupported] = useState(true);
  const [appState, setAppState] = useState<'discovery' | 'dashboard'>('dashboard');

  useEffect(() => {
    // SiloOS Dashboard Specialization: Auto-connect to native gateway
    setIsSupported(true); // Remote is always supported

    // Auto-connect to the machine via Pi
    const conn = new TopBrewerConnection(undefined, true);
    setConnection(conn);

    // Note: The actual BLE connection happens on the Pi.
    // We just need to tell the connection object to "connect" to our relay.
    conn.connect();
  }, []);

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
    <div className="app-container">
      {appState === 'discovery' && (
        <DiscoveryScreen onConnect={handleConnect} isSupported={isSupported} />
      )}

      {appState === 'dashboard' && (
        <div className="screen dashboard-screen">
          <header className="header">
            <h1>SiloOS Live Dashboard</h1>
            <div className="flex gap-2">
              {!connection && (
                <button className="btn btn-primary" onClick={() => {
                  const conn = new TopBrewerConnection(undefined, true);
                  conn.connect().then(success => {
                    if (success) setConnection(conn);
                  });
                }}>
                  Connect TopBrewer
                </button>
              )}
              {connection && (
                <>
                  <button className="btn-secondary" onClick={() => logger.downloadLogs()}>
                    Export Logs
                  </button>
                  <button className="btn-secondary" onClick={handleDisconnect}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </header>
          <DashboardScreen
            connection={connection}
            scaleManager={scaleManager}
            siloManager={siloManager}
          />
        </div>
      )}
    </div>
  );
}

export default App;
