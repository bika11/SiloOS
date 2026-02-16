// Remote BLE Adapter
// Replaces the browser-native BLEAdapter with one that relays via the Raspberry Pi

import { type BLEAdapterEvents } from './BLEAdapter';
import { logger } from '../utils/logger';
import { SiloManager } from './SiloManager';

/**
 * Remote BLE Adapter
 * Relays GATT operations over WebSocket to the Raspberry Pi bridge
 */
export class RemoteBLEAdapter {
    private events: BLEAdapterEvents;
    private siloManager: SiloManager;

    constructor(events: BLEAdapterEvents) {
        this.events = events;
        // In this architecture, we use the global SiloManager or a shared instance
        // For simplicity, we assume a siloManager is available or passed in
        this.siloManager = (window as any).siloManager;

        if (this.siloManager) {
            this.setupListeners();
        }
    }

    private setupListeners() {
        // Listen for status updates from the Pi
        this.siloManager.onStatusUpdate = (connected: boolean) => {
            this.events.onConnectionStateChange?.(connected ? 'connected' : 'disconnected');
        };

        // Listen for notifications relayed from the Pi
        this.siloManager.onMachineNotification = (uuid: string, data: Uint8Array) => {
            this.events.onNotification?.(uuid, data);
        };
    }

    static isSupported(): boolean {
        // Always "supported" because it doesn't use the browser's BLE API
        return true;
    }

    async scanForDevice(): Promise<any> {
        // In remote mode, the Pi handles discovery.
        // We just return a dummy device object.
        logger.info('RemoteBLE', 'Using Pi-Native Bluetooth Link');
        return { device: { name: 'Silo System (Remote)' } };
    }

    async connect(): Promise<void> {
        if (!this.siloManager) {
            throw new Error('SiloManager not initialized');
        }

        // Wait up to 5s for the WebSocket bridge to be ready
        const isReady = await this.siloManager.waitForBridge(5000);
        if (!isReady) {
            throw new Error('Silo Bridge not connected via WebSocket (Timeout)');
        }

        logger.info('RemoteBLE', 'Connected to Remote Relay');
        this.events.onConnectionStateChange?.('connected');
    }

    async disconnect(): Promise<void> {
        // No-op for remote mode (Pi stays connected)
    }

    isConnected(): boolean {
        // Use bridge connection, not async machineConnected (race condition on HMR/reload)
        return this.siloManager?.isBridgeConnected() ?? false;
    }

    async readCharacteristic(uuid: string): Promise<Uint8Array> {
        return await this.siloManager.remoteRead(uuid);
    }

    async writeCharacteristic(uuid: string, data: Uint8Array): Promise<void> {
        await this.siloManager.remoteWrite(uuid, data);
    }

    async startNotifications(_uuid: string): Promise<void> {
        // Notifications are automatically relayed by the Pi for known channels
    }

    async stopNotifications(_uuid: string): Promise<void> {
        // No-op
    }
}
