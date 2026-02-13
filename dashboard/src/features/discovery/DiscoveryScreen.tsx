// Feature: Discovery Screen
// Handles scanning and connecting to TopBrewer devices

import React, { useState } from 'react';
import { TopBrewerConnection } from '../../bluetooth';
import '../../features.css';

interface DiscoveryProps {
    onConnect: (connection: TopBrewerConnection) => void;
    isSupported: boolean;
}

export const DiscoveryScreen: React.FC<DiscoveryProps> = ({ onConnect, isSupported }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleScan = async () => {
        setIsScanning(true);
        setError(null);

        const connection = new TopBrewerConnection();

        try {
            const connected = await connection.connect();
            if (connected) {
                onConnect(connection);
            } else {
                // User cancelled or failed
                setIsScanning(false);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to connect. Please try again.');
            setIsScanning(false);
        }
    };

    if (!isSupported) {
        return (
            <div className="screen discovery-screen">
                <div className="card error-card">
                    <h2>⚠️ Not Supported</h2>
                    <p>Web Bluetooth is not available in this browser.</p>
                    <p className="text-secondary">Please use Chrome or Edge on Android/Desktop.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="screen discovery-screen">
            <div className="logo-container">
                <h1>TopBrewer</h1>
                <p className="subtitle">Amokka Edition</p>
            </div>

            <div className="scan-controls">
                <button
                    className={`btn-large ${isScanning ? 'scanning' : ''}`}
                    onClick={handleScan}
                    disabled={isScanning}
                >
                    {isScanning ? 'Connecting...' : 'Tap to Connect'}
                </button>

                {error && <p className="error-message">{error}</p>}

                <p className="hint-text">
                    Make sure your TopBrewer is powered on and within range.
                </p>
            </div>
        </div>
    );
};
