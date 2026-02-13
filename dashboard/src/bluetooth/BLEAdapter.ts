// BLE Adapter - Web Bluetooth API wrapper
// Handles device scanning, connection, and GATT operations
/// <reference types="web-bluetooth" />

import { logger } from '../utils/logger';
import {
    SERVICES,
    TOPBREWER_NAME_PREFIX,
} from './constants';


export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface BLEDevice {
    id: string;
    name: string;
    device: BluetoothDevice;
}

export interface BLEAdapterEvents {
    onConnectionStateChange?: (state: ConnectionState) => void;
    onDeviceDisconnected?: () => void;
    onNotification?: (characteristicId: string, data: Uint8Array) => void;
}

/**
 * BLE Adapter - manages Web Bluetooth connection to TopBrewer
 */
export class BLEAdapter {
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private services: Map<string, BluetoothRemoteGATTService> = new Map();
    private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map();
    private connectionState: ConnectionState = 'disconnected';
    private events: BLEAdapterEvents = {};

    // Operation queue to prevent "GATT operation in progress" errors
    private operationQueue: Array<() => Promise<void>> = [];
    private isProcessingQueue = false;

    constructor(events?: BLEAdapterEvents) {
        if (events) {
            this.events = events;
        }
    }

    /**
     * Check if Web Bluetooth is supported
     */
    static isSupported(): boolean {
        return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    }

    /**
     * Get current connection state
     */
    getState(): ConnectionState {
        return this.connectionState;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connectionState === 'connected' &&
            this.server !== null &&
            this.server.connected;
    }

    /**
     * Scan for and select a TopBrewer device
     * Returns the selected device or null if cancelled
     */
    async scanForDevice(): Promise<BLEDevice | null> {
        if (!BLEAdapter.isSupported()) {
            logger.error('BLE', 'Web Bluetooth not supported');
            throw new Error('Web Bluetooth is not supported in this browser');
        }

        logger.info('BLE', 'Starting device scan...');

        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: TOPBREWER_NAME_PREFIX },
                ],
                optionalServices: [
                    SERVICES.BASE,
                    SERVICES.DRINKS_MENU,
                    SERVICES.MACHINE,
                    SERVICES.BREW_STATUS,
                    SERVICES.ORDER,
                    SERVICES.DEVICE_INFORMATION,
                ],
            });

            logger.info('BLE', `Device selected: ${device.name}`, { id: device.id });

            return {
                id: device.id,
                name: device.name || 'Unknown TopBrewer',
                device,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'NotFoundError') {
                logger.info('BLE', 'User cancelled device selection');
                return null;
            }
            logger.error('BLE', 'Scan failed', error);
            throw error;
        }
    }

    /**
     * Connect to a TopBrewer device
     */
    async connect(device: BluetoothDevice): Promise<void> {
        if (this.connectionState === 'connected') {
            logger.warn('BLE', 'Already connected');
            return;
        }

        this.device = device;
        this.setConnectionState('connecting');

        try {
            // Setup disconnect handler
            device.addEventListener('gattserverdisconnected', this.handleDisconnect);

            logger.info('BLE', 'Connecting to GATT server...');
            this.server = await device.gatt!.connect();

            logger.info('BLE', 'Discovering services...');
            await this.discoverServices();

            this.setConnectionState('connected');
            logger.info('BLE', 'Connected successfully');
        } catch (error) {
            this.setConnectionState('disconnected');
            logger.error('BLE', 'Connection failed', error);
            throw error;
        }
    }

    /**
     * Disconnect from the device
     */
    async disconnect(): Promise<void> {
        if (!this.device || !this.server) {
            return;
        }

        this.setConnectionState('disconnecting');

        try {
            this.server.disconnect();
        } catch (error) {
            logger.warn('BLE', 'Disconnect error', error);
        }

        this.cleanup();
        this.setConnectionState('disconnected');
        logger.info('BLE', 'Disconnected');
    }

    /**
     * Write data to a characteristic
     */
    async writeCharacteristic(uuid: string, data: Uint8Array): Promise<void> {
        return this.queueOperation(async () => {
            const characteristic = this.characteristics.get(uuid);
            if (!characteristic) {
                throw new Error(`Characteristic not found: ${uuid}`);
            }

            logger.packet('BLE', 'TX', data);

            // Use writeValueWithoutResponse if supported for better performance
            // Create a DataView to ensure proper ArrayBuffer compatibility
            const buffer = new DataView(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            if (characteristic.properties.writeWithoutResponse) {
                await characteristic.writeValueWithoutResponse(buffer);
            } else {
                await characteristic.writeValue(buffer);
            }
        });
    }

    /**
     * Read data from a characteristic
     */
    async readCharacteristic(uuid: string): Promise<Uint8Array> {
        let result: Uint8Array = new Uint8Array(0);

        await this.queueOperation(async () => {
            const characteristic = this.characteristics.get(uuid);
            if (!characteristic) {
                throw new Error(`Characteristic not found: ${uuid}`);
            }

            const value = await characteristic.readValue();
            result = new Uint8Array(value.buffer);
            logger.packet('BLE', 'RX', result);
        });

        return result;
    }

    /**
     * Subscribe to notifications from a characteristic
     */
    async startNotifications(uuid: string): Promise<void> {
        return this.queueOperation(async () => {
            const characteristic = this.characteristics.get(uuid);
            if (!characteristic) {
                throw new Error(`Characteristic not found: ${uuid}`);
            }

            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                const target = event.target as BluetoothRemoteGATTCharacteristic;
                const data = new Uint8Array(target.value!.buffer);
                logger.packet('BLE', 'RX', data);
                this.events.onNotification?.(uuid, data);
            });

            await characteristic.startNotifications();
            logger.info('BLE', `Started notifications for ${uuid}`);
        });
    }

    /**
     * Stop notifications from a characteristic
     */
    async stopNotifications(uuid: string): Promise<void> {
        return this.queueOperation(async () => {
            const characteristic = this.characteristics.get(uuid);
            if (!characteristic) {
                return;
            }
            await characteristic.stopNotifications();
            logger.info('BLE', `Stopped notifications for ${uuid}`);
        });
    }

    // ============================================================
    // PRIVATE METHODS
    // ============================================================

    private setConnectionState(state: ConnectionState): void {
        this.connectionState = state;
        this.events.onConnectionStateChange?.(state);
    }

    private handleDisconnect = (): void => {
        logger.warn('BLE', 'Device disconnected');
        this.cleanup();
        this.setConnectionState('disconnected');
        this.events.onDeviceDisconnected?.();
    };

    private cleanup(): void {
        this.services.clear();
        this.characteristics.clear();
        this.server = null;
        if (this.device) {
            this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
        }
    }

    private async discoverServices(): Promise<void> {
        if (!this.server) return;

        const serviceUuids = [
            SERVICES.BASE,
            SERVICES.DRINKS_MENU,
            SERVICES.MACHINE,
            SERVICES.BREW_STATUS,
            SERVICES.ORDER,
        ];

        for (const uuid of serviceUuids) {
            try {
                const service = await this.server.getPrimaryService(uuid);
                this.services.set(uuid, service);
                logger.debug('BLE', `Found service: ${uuid}`);

                // Discover characteristics for this service
                const chars = await service.getCharacteristics();
                for (const char of chars) {
                    this.characteristics.set(char.uuid, char);
                    logger.debug('BLE', `Found characteristic: ${char.uuid}`);
                }
            } catch (error) {
                logger.warn('BLE', `Service not found: ${uuid}`);
            }
        }
    }

    /**
     * Queue BLE operations to prevent "GATT operation in progress" errors
     */
    private async queueOperation(operation: () => Promise<void>): Promise<void> {
        return new Promise((resolve, reject) => {
            this.operationQueue.push(async () => {
                try {
                    await operation();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.operationQueue.length > 0) {
            const operation = this.operationQueue.shift();
            if (operation) {
                try {
                    await operation();
                } catch (error) {
                    logger.error('BLE', 'Operation failed', error);
                }
            }
        }

        this.isProcessingQueue = false;
    }
}
