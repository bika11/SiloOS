import { logger } from '../utils/logger';
import { SERVICES, CHARACTERISTICS } from './constants';

export type ScaleConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface ScaleEvents {
    onWeightUpdate?: (weight: number) => void;
    onConnectionStateChange?: (state: ScaleConnectionState) => void;
    onError?: (error: Error) => void;
}

/**
 * ScaleManager - Handles BooKoo scale BLE connection and data parsing
 */
export class ScaleManager {
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private connectionState: ScaleConnectionState = 'disconnected';
    private events: ScaleEvents = {};

    constructor(events?: ScaleEvents) {
        if (events) {
            this.events = events;
        }
    }

    /**
     * Start connection process
     */
    async connect(): Promise<boolean> {
        if (!('bluetooth' in navigator)) {
            throw new Error('Web Bluetooth not supported');
        }

        try {
            this.setConnectionState('connecting');

            logger.info('Scale', 'Requesting scale device...');
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [SERVICES.SCALE] },
                ],
                optionalServices: [SERVICES.SCALE]
            });

            this.device = device;
            device.addEventListener('gattserverdisconnected', this.handleDisconnect);

            logger.info('Scale', 'Connecting to GATT server...');
            this.server = await device.gatt!.connect();

            logger.info('Scale', 'Getting service...');
            const service = await this.server.getPrimaryService(SERVICES.SCALE);

            logger.info('Scale', 'Getting characteristic...');
            this.characteristic = await service.getCharacteristic(CHARACTERISTICS.SCALE_DATA);

            this.characteristic.addEventListener('characteristicvaluechanged', this.handleData);
            await this.characteristic.startNotifications();

            this.setConnectionState('connected');
            logger.info('Scale', 'Connected and notifications started');
            return true;
        } catch (error) {
            this.setConnectionState('disconnected');
            logger.error('Scale', 'Connection failed', error);
            this.events.onError?.(error as Error);
            return false;
        }
    }

    /**
     * Disconnect from scale
     */
    async disconnect(): Promise<void> {
        if (this.server) {
            this.server.disconnect();
        }
        this.cleanup();
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connectionState === 'connected' && !!this.server?.connected;
    }

    /**
     * Get current state
     */
    getState(): ScaleConnectionState {
        return this.connectionState;
    }

    private handleDisconnect = (): void => {
        logger.warn('Scale', 'Disconnected');
        this.cleanup();
        this.setConnectionState('disconnected');
    };

    private cleanup(): void {
        this.characteristic = null;
        this.server = null;
        if (this.device) {
            this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
            this.device = null;
        }
    }

    private setConnectionState(state: ScaleConnectionState): void {
        this.connectionState = state;
        this.events.onConnectionStateChange?.(state);
    }

    /**
     * Parse weight data from BLE characteristic
     */
    private handleData = (event: Event): void => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        if (!target.value) return;

        const data = new Uint8Array(target.value.buffer);

        // BooKoo Protocol Parsing
        // 1. Check for text format (e.g. "123.4g")
        const text = new TextDecoder().decode(data).trim();
        const weightMatch = text.match(/^(-?\d+\.?\d*)/);

        if (weightMatch && !isNaN(parseFloat(weightMatch[1]))) {
            const weight = parseFloat(weightMatch[1]);
            this.events.onWeightUpdate?.(weight);
            return;
        }

        // 2. Check for 3-byte binary format (observed in some BooKoo/Acaia clones)
        // [W1, W2, W3] -> (W1 << 16 | W2 << 8 | W3) / 100.0
        if (data.length >= 3) {
            try {
                // Some scales use 2 bytes signed + 1 byte for units or status
                // But the research suggested 3-byte big endian for some BooKoo variants
                const raw = (data[0] << 16) | (data[1] << 8) | data[2];
                // Handle potential 18-bit or 24-bit signedness if needed, 
                // but usually it's just a large positive number for grams*100
                const weight = raw / 100.0;

                // Sanity check: if weight is reasonable (e.g. < 5000g)
                if (weight >= -500 && weight < 5000) {
                    this.events.onWeightUpdate?.(weight);
                    return;
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }

        logger.packet('Scale', 'RX', data, 'Unknown Format');
    };
}
