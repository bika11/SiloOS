import { logger } from '../utils/logger';
import type { Recipe } from '../features/dosing/Recipe';

export interface PiDoseMessage {
    siloId: string;
    state: string;
    dispensedKg?: number;
    targetKg?: number;
    progress?: number;
    flowRateKgPerS?: number;
    result?: { targetKg: number; actualKg: number; overshootKg: number; durationMs: number; flowRateKgPerS: number };
    reason?: string;
}

export interface SiloEvents {
    onWeightUpdate?: (weight: number) => void;
    onNetWeightUpdate?: (netWeight: number) => void;
    onConnectionChange?: (connected: boolean) => void;
    onStatusUpdate?: (connected: boolean) => void;
    onMachineNotification?: (uuid: string, data: Uint8Array) => void;
    onGlobalAbort?: (reason: string) => void;
    onDoseAck?: (siloId: string, tareG: number, targetKg: number) => void;
    onDoseUpdate?: (msg: PiDoseMessage) => void;
    onDoseRejected?: (siloId: string, reason: string) => void;
}

/**
 * SiloManager - Handles WebSocket connection to the SiloOS Bridge
 */
export class SiloManager {
    private socket: WebSocket | null = null;
    private events: SiloEvents = {};
    private isConnected: boolean = false;
    private machineConnected: boolean = false;
    private lastWeight: number = 0;
    private lastNetWeight: number = 0;
    private tareOffset: number = 0;
    private reconnectTimeout: any = null;
    private url: string;
    private settings: any = { theme: 'dark', hidden_recipes: [] };
    private preferences: Record<string, any> = {};
    private profiles: Record<string, any> = {};
    private recipes: Record<string, Recipe> = {};

    // Callbacks for the RemoteBLEAdapter
    private listeners: {
        settings: ((s: any) => void)[];
        status: ((c: boolean) => void)[];
        notifications: ((uuid: string, data: Uint8Array) => void)[];
        sfwu: ((packet: string) => void)[];
        recipes: ((r: Record<string, Recipe>) => void)[];
    } = { settings: [], status: [], notifications: [], sfwu: [], recipes: [] };

    public addRecipesListener(cb: (r: Record<string, Recipe>) => void) { this.listeners.recipes.push(cb); }
    public removeRecipesListener(cb: (r: Record<string, Recipe>) => void) { this.listeners.recipes = this.listeners.recipes.filter(l => l !== cb); }

    public addSettingsListener(cb: (s: any) => void) { this.listeners.settings.push(cb); }
    public removeSettingsListener(cb: (s: any) => void) { this.listeners.settings = this.listeners.settings.filter(l => l !== cb); }
    public addStatusListener(cb: (c: boolean) => void) { this.listeners.status.push(cb); }
    public removeStatusListener(cb: (c: boolean) => void) { this.listeners.status = this.listeners.status.filter(l => l !== cb); }
    public addNotificationListener(cb: (uuid: string, data: Uint8Array) => void) { this.listeners.notifications.push(cb); }
    public removeNotificationListener(cb: (uuid: string, data: Uint8Array) => void) { this.listeners.notifications = this.listeners.notifications.filter(l => l !== cb); }
    public addSfwuListener(cb: (packet: string) => void) { this.listeners.sfwu.push(cb); }
    public removeSfwuListener(cb: (packet: string) => void) { this.listeners.sfwu = this.listeners.sfwu.filter(l => l !== cb); }

    // RemoteBLEAdapter compatibility properties
    public onStatusUpdate?: (connected: boolean) => void;
    public onMachineNotification?: (uuid: string, data: Uint8Array) => void;
    public onSfwuPacket?: (hex: string) => void;

    // Track pending reads
    private pendingReads: Map<string, (data: Uint8Array) => void> = new Map();
    // Track pending tare
    private pendingTare: ((offset: number) => void) | null = null;

    constructor(url: string = '', events?: SiloEvents) {
        // SiloOS Intelligence: Use the same host/protocol as the page.
        // This handles SSH tunnels (localhost), HTTPS (wss), and direct IP access.
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;

        // Use environment variable if available, otherwise fallback to default
        const authToken = (import.meta as any).env?.VITE_WS_AUTH_TOKEN || 'silo-secret';

        this.url = url || `${protocol}//${host}:8765/?auth=${authToken}`;

        if (events) {
            this.events = events;
        }

        // SiloOS Remote Logging: Forward all PWA logs to the bridge terminal
        logger.setOnLog((log) => {
            this.send({ log });
        });

        // Start automatic connection
        this.connect();
    }

    /**
     * Start WebSocket connection
     */
    connect(): void {
        if (this.socket || this.reconnectTimeout) return;

        try {
            logger.info('SiloManager', `Connecting to ${this.url}...`);
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                logger.info('SiloManager', 'Connected to SiloOS Bridge');
                this.isConnected = true;
                this.events.onConnectionChange?.(true);
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // 1. Initial Sync handling
                    if (data.type === 'sync') {
                        if (typeof data.weight === 'number') {
                            this.lastWeight = data.weight;
                            this.events.onWeightUpdate?.(data.weight);
                        }
                        if (typeof data.tare_offset === 'number') {
                            this.tareOffset = data.tare_offset;
                        }
                        if (data.settings) {
                            this.settings = data.settings;
                            this.listeners.settings.forEach(l => l(data.settings));
                        }
                        if (data.preferences) {
                            this.preferences = data.preferences;
                        }
                        if (data.profiles) {
                            this.profiles = data.profiles;
                        }
                        if (data.recipes) {
                            this.recipes = data.recipes;
                            this.listeners.recipes.forEach(l => l(data.recipes));
                        }
                    }

                    // 2. Weight handling
                    if (typeof data.weight === 'number' && data.type !== 'sync') {
                        this.lastWeight = data.weight;
                        this.events.onWeightUpdate?.(data.weight);
                    }
                    if (typeof data.net === 'number') {
                        this.lastNetWeight = data.net;
                        this.events.onNetWeightUpdate?.(data.net);
                    }

                    // 3. Dynamic updates from bridge
                    if (data.type === 'settings_update') {
                        this.settings = data.settings;
                        this.listeners.settings.forEach(l => l(data.settings));
                    }
                    if (data.type === 'preferences_update') {
                        this.preferences = data.preferences;
                    }
                    if (data.type === 'profiles_update') {
                        this.profiles = data.profiles;
                    }
                    if (data.type === 'recipes_update') {
                        this.recipes = data.recipes;
                        this.listeners.recipes.forEach(l => l(data.recipes));
                    }

                    // 4. Machine connection status handling
                    if (data.type === 'status') {
                        this.machineConnected = data.connected;
                        this.listeners.status.forEach(l => l(data.connected));
                        this.events.onStatusUpdate?.(data.connected);
                    }

                    // 3. BLE Notification handling
                    if (data.type === 'notification') {
                        const payload = this.hexToBytes(data.data);
                        this.onMachineNotification?.(data.uuid, payload);
                        this.listeners.notifications.forEach(l => l(data.uuid, payload));
                        this.events.onMachineNotification?.(data.uuid, payload);
                    }

                    // 4. BLE Read response handling
                    if (data.type === 'read_response') {
                        const payload = this.hexToBytes(data.data);
                        const callback = this.pendingReads.get(data.uuid);
                        if (callback) {
                            callback(payload);
                            this.pendingReads.delete(data.uuid);
                        }
                    }

                    // 6. SFWU Packet handling (Legacy support / Broadcasts)
                    if (data.type === 'sfwu' && data.packet) {
                        this.onSfwuPacket?.(data.packet);
                        this.listeners.sfwu.forEach(l => l(data.packet));
                    }

                    // 7. Tare acknowledgment
                    if (data.type === 'tare_ack') {
                        if (this.pendingTare) {
                            this.pendingTare(data.offset);
                            this.pendingTare = null;
                        }
                    }

                    // 6. Pi Dose Control messages
                    if (data.type === 'dose_ack') {
                        this.events.onDoseAck?.(data.siloId, data.tareG, data.targetKg);
                    }
                    if (data.type === 'dose_update') {
                        this.events.onDoseUpdate?.(data as PiDoseMessage);
                    }
                    if (data.type === 'dose_rejected') {
                        this.events.onDoseRejected?.(data.siloId, data.reason);
                    }

                } catch (err) {
                    logger.error('SiloManager', 'Failed to parse bridge data', err);
                }
            };

            this.socket.onclose = () => {
                this.handleDisconnect();
            };

            this.socket.onerror = () => {
                logger.debug('SiloManager', 'WebSocket error (bridge likely offline)');
                this.handleDisconnect();
            };

        } catch (err) {
            this.handleDisconnect();
        }
    }

    private handleDisconnect(): void {
        if (this.isConnected) {
            logger.warn('SiloManager', 'Disconnected from SiloOS Bridge');
            this.isConnected = false;
            this.events.onConnectionChange?.(false);
        }

        this.socket = null;

        // Attempt reconnection after 5 seconds
        if (!this.reconnectTimeout) {
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                this.connect();
            }, 5000);
        }
    }

    isBridgeConnected(): boolean {
        return this.isConnected;
    }

    async waitForBridge(timeoutMs: number = 5000): Promise<boolean> {
        if (this.isConnected) return true;

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(this.isConnected);
            }, timeoutMs);

            const check = () => {
                if (this.isConnected) {
                    clearTimeout(timeout);
                    resolve(true);
                } else if (timeoutMs > 0) {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    getWeight(): number {
        return this.lastWeight;
    }

    getNetWeight(): number {
        return this.lastNetWeight;
    }

    /**
     * Send data to bridge
     */
    send(data: any): void {
        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(data));
        }
    }

    /**
     * Send dose telemetry to the Pi for audit logging.
     * Fire-and-forget — never affects dispensing control flow.
     */
    sendTelemetry(data: Record<string, unknown>): void {
        this.send(data);
    }

    /**
     * BLE Relay methods
     */

    isMachineConnected(): boolean {
        return this.machineConnected;
    }

    remoteWrite(uuid: string, data: Uint8Array): void {
        this.send({
            type: 'write',
            uuid: uuid.toLowerCase(),
            data: this.bytesToHex(data)
        });
    }

    /**
     * Tare the scale — records current weight as zero point.
     * Returns the tare offset value.
     */
    async tare(): Promise<number> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingTare = null;
                reject(new Error('Tare timeout'));
            }, 3000);

            this.pendingTare = (offset) => {
                clearTimeout(timeout);
                logger.info('SiloManager', `Tare acknowledged: offset=${offset}g`);
                resolve(offset);
            };

            this.send({ type: 'tare' });
        });
    }

    async remoteRead(uuid: string): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingReads.delete(uuid.toLowerCase());
                reject(new Error(`Read timeout for ${uuid}`));
            }, 5000);

            this.pendingReads.set(uuid.toLowerCase(), (data) => {
                clearTimeout(timeout);
                resolve(data);
            });

            this.send({
                type: 'read',
                uuid: uuid.toLowerCase()
            });
        });
    }

    private bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Update URL and reconnect
     */
    updateUrl(url: string): void {
        this.url = url;
        if (this.socket) {
            this.socket.close();
        } else {
            this.connect();
        }
    }

    getSettings(): any {
        return this.settings;
    }

    updateSettings(newSettings: any): void {
        this.send({
            type: 'update_settings',
            settings: newSettings
        });
    }

    getPreferences(): Record<string, any> {
        return this.preferences;
    }

    updatePreferences(newPreferences: any): void {
        this.send({
            type: 'update_preferences',
            preferences: newPreferences
        });
    }

    getProfiles(): Record<string, any> {
        return this.profiles;
    }

    updateProfiles(newProfiles: any): void {
        this.send({
            type: 'update_profiles',
            profiles: newProfiles
        });
    }

    getRecipes(): Record<string, Recipe> {
        return this.recipes;
    }

    updateRecipes(newRecipes: Record<string, Recipe>): void {
        this.send({
            type: 'update_recipes',
            recipes: newRecipes
        });
    }

    /**
     * Broadcasts a global abort to any active controllers (Recipes / Customizers)
     */
    public abortAll(reason: string = 'Emergency Stop') {
        logger.warn('SiloManager', `Broadcasting global abort: ${reason}`);
        this.events.onGlobalAbort?.(reason);
    }
}
