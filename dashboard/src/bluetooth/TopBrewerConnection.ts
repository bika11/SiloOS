// TopBrewer Connection Manager
// High-level interface for communicating with TopBrewer via BLE

import { BLEAdapter, type ConnectionState, type BLEAdapterEvents } from './BLEAdapter';
import { RemoteBLEAdapter } from './RemoteBLEAdapter';
import { CHARACTERISTICS } from './constants';
import { logger } from '../utils/logger';
import { parsePacket, findPacketInStream, type SfwuPacket } from '../sfwu/SFWU';
import { buildResetCommand } from '../sfwu/commands/CoffeeCommands';
import { buildOrderRequest, createSimpleOrder, type Order } from '../sfwu/commands/OrderCommand';
import { parseMenuXml } from '../utils/xmlParser';
import type { ParsedMenuItem } from '../entities/Menu';
import { MenuDetailsParser } from '../sfwu/parsers/MenuDetailsParser';
import { ResponseFactory, type ParsedSfwuResponse } from '../sfwu/ResponseFactory';
import type { BrewStatus } from '../sfwu/parsers/BrewStatusParser';
import type { OrderResponse } from '../entities/OrderResponse';
import type { Temperatures } from '../entities/Temperature';

import type { MenuDetails } from '../sfwu/types/MenuDetails';

export type TopBrewerState = 'idle' | 'connecting' | 'connected' | 'ordering' | 'brewing' | 'error';

export interface TopBrewerEvents {
    onStateChange?: (state: TopBrewerState) => void;
    onPacketReceived?: (packet: SfwuPacket) => void;
    onBrewStatusUpdate?: (status: BrewStatus) => void;
    onMenuReceived?: (menu: ParsedMenuItem[]) => void;
    onDrinkDetailsReceived?: (details: MenuDetails) => void;
    onOrderConfirmed?: (response: OrderResponse) => void;
    onTemperaturesReceived?: (temps: Temperatures) => void;
    onError?: (error: Error) => void;
}

/**
 * TopBrewer Connection Manager
 * Provides high-level API for TopBrewer operations
 */
export class TopBrewerConnection {
    private adapter: BLEAdapter | RemoteBLEAdapter;
    private state: TopBrewerState = 'idle';
    public events: TopBrewerEvents = {}; // Made public for direct access if needed
    private rxBuffer: Uint8Array = new Uint8Array(0);
    private multipartBuffer: Uint8Array | null = null;

    // --- Command Queuing (Production Fidelity) ---
    private commandQueue: Promise<any> = Promise.resolve();
    private pendingAckResolver: ((value: boolean) => void) | null = null;
    private readonly ACK_TIMEOUT = 5000; // 5 seconds (match QueueRunnerService.java)

    constructor(events?: TopBrewerEvents, useRemote = false) {
        if (events) {
            this.events = events;
        }

        const adapterEvents: BLEAdapterEvents = {
            onConnectionStateChange: this.handleConnectionChange,
            onDeviceDisconnected: this.handleDisconnect,
            onNotification: this.handleNotification,
        };

        if (useRemote) {
            this.adapter = new RemoteBLEAdapter(adapterEvents);
            logger.info('TopBrewer', 'Initialized with Remote BLE Adapter (Pi Relay)');
        } else {
            this.adapter = new BLEAdapter(adapterEvents);
            logger.info('TopBrewer', 'Initialized with Native Web Bluetooth Adapter');
        }
    }

    /**
     * Get current state
     */
    getState(): TopBrewerState {
        return this.state;
    }

    /**
     * Check if we can connect (Web Bluetooth supported)
     */
    static isSupported(): boolean {
        return BLEAdapter.isSupported();
    }

    /**
     * Scan for and connect to a TopBrewer device
     */
    async connect(): Promise<boolean> {
        try {
            this.setState('connecting');

            if (this.adapter instanceof BLEAdapter) {
                const device = await this.adapter.scanForDevice();
                if (!device) {
                    this.setState('idle');
                    return false;
                }
                await this.adapter.connect(device.device);
            } else {
                // Remote adapter handles connection internally or via Pi
                await this.adapter.connect();
            }

            await this.setupNotifications();

            this.setState('connected');
            return true;
        } catch (error) {
            this.handleError(error as Error);
            return false;
        }
    }

    /**
     * Disconnect from the device
     */
    async disconnect(): Promise<void> {
        await this.adapter.disconnect();
        this.setState('idle');
    }

    /**
     * Send a coffee order
     */
    async sendOrder(menuId: number, cups = 1): Promise<boolean> {
        if (this.state !== 'connected') {
            logger.warn('TopBrewer', 'Not connected');
            return false;
        }

        return this.enqueue(async () => {
            try {
                this.setState('ordering');
                const order = createSimpleOrder(menuId, cups);
                const packet = buildOrderRequest(order);
                logger.packet('TopBrewer', 'TX', packet, `Order(ID=${menuId}, Cups=${cups})`);

                // Use specialized Order Characteristic with chunking
                await this.sendOrderPacket(packet);

                return true;
            } catch (error) {
                this.handleError(error as Error);
                return false;
            } finally {
                this.setState('connected');
            }
        });
    }

    /**
     * Send a custom order with all options
     * Android flow: write "start" to 0x0503 (unlocks 0x0501), then single write to 0x0501
     */
    async sendCustomOrder(order: Order): Promise<boolean> {
        if (this.state !== 'connected' && this.state !== 'error') {
            logger.warn('TopBrewer', 'Not connected', { state: this.state });
            return false;
        }

        return this.enqueue(async () => {
            try {
                this.setState('ordering');

                // Session start unlocks SET_ORDER characteristic (0x0501) for writing
                await this.startSession();
                await new Promise(resolve => setTimeout(resolve, 200));

                const packet = buildOrderRequest(order);
                logger.packet('TopBrewer', 'TX', packet, `CustomOrder(ID=${order.menuId}, Ings=${order.ingredients.length})`);

                await this.sendOrderPacket(packet);

                return true;
            } catch (error) {
                this.handleError(error as Error);
                return false;
            } finally {
                this.setState('connected');
            }
        });
    }

    /**
     * Start a new session (required before ordering on modern firmware)
     * Writes "start" to Order Session Characteristic
     */
    async startSession(): Promise<boolean> {
        if (!this.adapter.isConnected()) return false;
        try {
            logger.info('TopBrewer', 'Starting Session...');
            const data = new TextEncoder().encode('start');
            await this.adapter.writeCharacteristic(CHARACTERISTICS.START_SESSION, data);
            return true;
        } catch (err) {
            logger.error('TopBrewer', 'Failed to start session', err);
            return false;
        }
    }

    /**
     * Stop current session (stops dispensing immediately)
     * Writes "stop" to Order Session Characteristic
     */
    async stopSession(): Promise<boolean> {
        if (!this.adapter.isConnected()) return false;
        try {
            logger.info('TopBrewer', 'Stopping Session...');
            const data = new TextEncoder().encode('stop');
            await this.adapter.writeCharacteristic(CHARACTERISTICS.START_SESSION, data);
            return true;
        } catch (err) {
            logger.error('TopBrewer', 'Failed to stop session', err);
            return false;
        }
    }

    /**
     * Cancel the current order / reset
     * Uses Session Stop for immediate halt
     */
    async cancelOrder(): Promise<boolean> {
        if (!this.adapter.isConnected()) {
            return false;
        }

        return this.enqueue(async () => {
            try {
                // Android uses Session Stop to cancel/abort
                await this.stopSession();

                // Also send legacy reset just in case
                const packet = buildResetCommand();
                logger.packet('TopBrewer', 'TX', packet, 'Reset/Cancel');
                await this.sendOrderPacket(packet);

                return true;
            } catch (error) {
                this.handleError(error as Error);
                return false;
            } finally {
                this.setState('connected');
            }
        });
    }

    /**
     * Request menu from machine
     */
    async requestMenu(): Promise<boolean> {
        if (!this.adapter.isConnected()) {
            return false;
        }

        return this.enqueue(async () => {
            try {
                // The Android app reads the Drinks Characteristic instead of sending a command
                logger.info('TopBrewer', 'Reading Menu from Drinks Characteristic...');
                const value = await this.adapter.readCharacteristic(CHARACTERISTICS.DRINKS);

                // Inject into RX pipeline to handle parsing (SFWU or XML)
                this.handleNotification(CHARACTERISTICS.DRINKS, value);

                return true;
            } catch (error) {
                this.handleError(error as Error);
                return false;
            }
        }, false); // Reads don't wait for a separate ACK
    }

    /**
     * Request current brew status
     */
    async requestBrewStatus(): Promise<boolean> {
        if (!this.adapter.isConnected()) {
            return false;
        }

        return this.enqueue(async () => {
            try {
                // Android app READS the characteristic, does NOT send a command
                logger.info('TopBrewer', 'Reading Brew Status...');
                const value = await this.adapter.readCharacteristic(CHARACTERISTICS.BREW_STATUS);

                // Inject into RX pipeline to update state
                this.handleNotification(CHARACTERISTICS.BREW_STATUS, value);

                return true;
            } catch (error) {
                this.handleError(error as Error);
                return false;
            }
        }, false); // Reads don't wait for a separate ACK
    }

    /**
 * Request details for a specific menu item.
 * Android reads a per-drink BLE characteristic directly (not via SFWU).
 * UUID pattern: c0ffee00-2624-46ff-9311-4d70831601XX  (XX = zero-padded drink index)
 */
    async requestDrinkDetails(menuId: number): Promise<boolean> {
        if (!this.adapter.isConnected()) {
            return false;
        }

        return this.enqueue(async () => {
            try {
                const drinkUuid = `c0ffee00-2624-46ff-9311-4d70831601${menuId.toString().padStart(2, '0')}`;
                logger.info('TopBrewer', `Reading drink details characteristic: ${drinkUuid}`);
                const data = await this.adapter.readCharacteristic(drinkUuid);
                logger.info('TopBrewer', `Got drink details: ${data.length} bytes`);

                if (data.length > 0) {
                    const details = MenuDetailsParser.parse(data);
                    this.events.onDrinkDetailsReceived?.(details);
                }
                return true;
            } catch (error) {
                logger.error('TopBrewer', 'Failed to read drink details', error);
                this.handleError(error as Error);
                return false;
            }
        }, false); // No SFWU ACK for read
    }
    // ============================================================
    // PRIVATE METHODS
    // ============================================================

    /**
     * Send a packet to the Order Characteristic.
     * Android production sends the full packet in a single write (ORDER_CMD_ENABLED = false).
     */
    private async sendOrderPacket(packet: Uint8Array): Promise<void> {
        await this.adapter.writeCharacteristic(CHARACTERISTICS.SET_ORDER, packet);
    }

    // ============================================================
    // PRIVATE METHODS
    // ============================================================

    private setState(state: TopBrewerState): void {
        if (this.state === state) return; // Ignore if no change
        this.state = state;
        this.events.onStateChange?.(state);
    }

    private handleConnectionChange = (state: ConnectionState): void => {
        logger.info('TopBrewer', `Connection state: ${state}`);
        if (state === 'connected') {
            this.setState('connected');
        } else if (state === 'disconnected') {
            this.setState('idle');
        }
    };

    private handleDisconnect = (): void => {
        logger.warn('TopBrewer', 'Disconnected from device');
        this.setState('idle');
    };

    private handleNotification = (uuid: string, data: Uint8Array): void => {
        // Special Handling for Drinks Characteristic (Direct Read)
        if (uuid === CHARACTERISTICS.DRINKS) {
            // Resolve pending command if we were waiting for a read response
            if (this.pendingAckResolver) {
                this.pendingAckResolver(true);
                this.pendingAckResolver = null;
            }

            logger.debug('TopBrewer', `Received Drinks Data: ${data.length} bytes. Hex: ${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

            const response = ResponseFactory.parseCharacteristic(uuid, data);
            if (response && response.type === 'MENU') {
                logger.info('TopBrewer', `Parsed ${response.data.length} items from Binary Characteristic`);
                response.data.forEach((item: any) => {
                    logger.debug('TopBrewer', `  - ID=${item.id} GID=${item.graphicId} Name='${item.name}'`);
                });
                this.events.onMenuReceived?.(response.data);
            }
            return;
        }

        // Special Handling for Brew Status (Binary, not SFWU)
        if (uuid === CHARACTERISTICS.BREW_STATUS) {
            // Resolve pending command
            if (this.pendingAckResolver) {
                this.pendingAckResolver(true);
                this.pendingAckResolver = null;
            }

            // The Android app uses SfwuResponseFactory.createBrewStatusDeviceResponse
            // BUT that parser expects extracted SFWU data.
            // If the characteristic returns RAW SFWU packet: OK
            // If it returns JUST payload: We need to parse manually or check ResponseFactory

            // Try to parse as SFWU Characteristic first via Factory
            const response = ResponseFactory.parseCharacteristic(uuid, data);
            if (response && response.type === 'BREW_STATUS') {
                logger.info('TopBrewer', `Parsed Brew Status from Characteristic`);
                this.events.onBrewStatusUpdate?.(response.data);
            } else {
                // Fallback or Unknown
                logger.debug('TopBrewer', 'Received Brew Status data but failed to parse', data);
            }
            return;
        }

        // Append to RX buffer (Standard SFWU - SFWU_CHANNEL)
        const newBuffer = new Uint8Array(this.rxBuffer.length + data.length);
        newBuffer.set(this.rxBuffer);
        newBuffer.set(data, this.rxBuffer.length);
        this.rxBuffer = newBuffer;

        // Try to parse complete packets
        this.processRxBuffer();
    };



    private processRxBuffer(): void {
        // Process buffer for packets
        while (true) {
            const packetResult = findPacketInStream(this.rxBuffer);
            if (!packetResult) break;

            const { offset, data: packetBytes } = packetResult;
            const packet = parsePacket(packetBytes);

            if (packet) {
                // ANY valid SFWU packet from the machine resolves a pending write ACK
                // This ensures the queue doesn't hang even if we get an unknown response or heartbeat
                if (this.pendingAckResolver) {
                    this.pendingAckResolver(true);
                    this.pendingAckResolver = null;
                }

                logger.info('TopBrewer', `RX Pkt: CMD=0x${packet.command.toString(16).toUpperCase()} LEN=${packet.dataLength}`);
                this.events.onPacketReceived?.(packet);

                // 1. Let the Factory handle specialized binary commands (C2, C3, C4, C5, C6, etc.)
                const response = ResponseFactory.parseSfwuPacket(packet.command, packet.data);
                if (response && response.type !== 'UNKNOWN') {
                    this.handleParsedResponse(response);
                }
                // 2. Handle Stateful / Multipart Commands
                else if (packet.command === 0x00A0) {
                    logger.info('TopBrewer', 'Starting Multipart Assembly (A0)');
                    this.multipartBuffer = packet.data;
                }
                else if (packet.command === 0x00A1) {
                    if (this.multipartBuffer) {
                        const newBuffer = new Uint8Array(this.multipartBuffer.length + packet.data.length);
                        newBuffer.set(this.multipartBuffer);
                        newBuffer.set(packet.data, this.multipartBuffer.length);
                        this.multipartBuffer = newBuffer;
                    }
                }
                else if (packet.command === 0x00A2) {
                    if (this.multipartBuffer) {
                        this.handleMultipartComplete();
                        this.multipartBuffer = null;
                    }
                }
                // 3. Fallback for legacy XML commands (0x06)
                else if (packet.command === 0x0006) {
                    this.handleXmlPayload(packet.data);
                }
                // 4. Handle VER_GET (0x02) - Ping/Heartbeat from Machine
                else if (packet.command === 0x0002) {
                    // Machine requesting version/status often acts as a heartbeat
                    // We acknowledge it implicitly by parsing it, but for now we just suppress the log
                    // logger.debug('TopBrewer', 'Received VER_GET (0x02)');
                }
                else {
                    logger.debug('TopBrewer', `Unhandled Command: 0x${packet.command.toString(16).toUpperCase()}`);
                }
            }

            // Remove processed bytes (offset + length)
            // This safely removes garbage before the packet AND the packet itself
            this.rxBuffer = this.rxBuffer.slice(offset + packetBytes.length);
        }
    }

    private handleMultipartComplete(): void {
        if (!this.multipartBuffer) return;
        try {
            this.handleXmlPayload(this.multipartBuffer);
        } catch (e) {
            logger.error('TopBrewer', 'Failed to parse multipart payload');
        }
    }

    private handleXmlPayload(data: Uint8Array): void {
        try {
            const text = new TextDecoder().decode(data);
            if (text.includes('<menu>')) {
                const menu = parseMenuXml(text);
                this.events.onMenuReceived?.(menu);
            }
        } catch (e) { /* ignore */ }
    }

    private handleParsedResponse(response: ParsedSfwuResponse): void {
        switch (response.type) {
            case 'BREW_STATUS':
                this.events.onBrewStatusUpdate?.(response.data);
                break;
            case 'ORDER_RESPONSE':
                this.events.onOrderConfirmed?.(response.data);
                break;
            case 'TEMPERATURES':
                this.events.onTemperaturesReceived?.(response.data);
                break;
            case 'MENU':
                this.events.onMenuReceived?.(response.data);
                break;
            case 'MENU_ITEM_DETAILS':
                this.events.onDrinkDetailsReceived?.(response.data);
                break;
        }
    }

    /**
     * Helper to enqueue a command and wait for a response/ack
     */
    private async enqueue<T>(action: () => Promise<T>, expectAck = true): Promise<T> {
        const result = this.commandQueue.then(async () => {
            try {
                // Set up ACK resolver BEFORE performing action to catch early responses
                let ackPromise: Promise<boolean> | null = null;
                if (expectAck) {
                    ackPromise = this.createAckPromise();
                }

                const res = await action();

                if (ackPromise) {
                    await ackPromise;
                }
                return res;
            } catch (error) {
                logger.error('TopBrewer', 'Queue Action Failed', error);
                throw error;
            }
        });

        this.commandQueue = result.catch(() => { }); // Prevent queue from dying on single failure
        return result;
    }

    /**
     * Create a promise that resolves when any valid SFWU packet arrives
     */
    private createAckPromise(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.pendingAckResolver) {
                    logger.warn('TopBrewer', 'ACK Timeout reached');
                    this.pendingAckResolver = null;
                    resolve(false);
                }
            }, this.ACK_TIMEOUT);

            this.pendingAckResolver = (success) => {
                clearTimeout(timeout);
                resolve(success);
            };
        });
    }

    private async setupNotifications(): Promise<void> {
        try {
            // Subscribe to SFWU channel for responses
            await this.adapter.startNotifications(CHARACTERISTICS.SFWU_CHANNEL);
            // Subscribe to Brew Status as well (missing stream?)
            await this.adapter.startNotifications(CHARACTERISTICS.BREW_STATUS);
            logger.info('TopBrewer', 'Notifications set up');
        } catch (error) {
            logger.warn('TopBrewer', 'Failed to setup notifications', error);
        }
    }

    private handleError(error: Error): void {
        logger.error('TopBrewer', 'Error', error);
        // Don't lock into error state permanently, just notify
        this.events.onError?.(error);
    }
}
