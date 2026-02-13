// TopBrewer PWA - Logging Utility
// Comprehensive logging for debugging BLE communication and protocol issues
// Aligned with Forensic Logger skill best practices

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface LogEntry {
    timestamp: string;      // ISO 8601
    level: LogLevel;
    levelName: string;
    tag: string;            // Component name
    message: string;
    data?: any;
    hex?: string;           // Packet bytes (if applicable)
}

const STORAGE_KEY = 'topbrewer_forensic_logs';
const MAX_LOGS = 1000;

class Logger {
    private logs: LogEntry[] = [];
    private minLevel: LogLevel = LogLevel.DEBUG;

    private levelNames: Record<LogLevel, string> = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.ERROR]: 'ERROR',
    };

    constructor() {
        this.loadLogs();
    }

    private loadLogs() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                this.logs = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load logs from storage', e);
        }
    }

    private saveLogs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
        } catch (e) {
            // If storage is full, clear half and try again
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                this.logs = this.logs.slice(MAX_LOGS / 2);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
            }
        }
    }

    private onLogHook: ((entry: LogEntry) => void) | null = null;

    private log(level: LogLevel, tag: string, message: string, data?: any, hex?: string) {
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            levelName: this.levelNames[level],
            tag,
            message,
            data,
            hex,
        };

        this.logs.push(entry);
        if (this.logs.length > MAX_LOGS) {
            this.logs.shift();
        }

        this.saveLogs();

        // Custom Hook: Used to stream logs to the bridge
        if (this.onLogHook) {
            try { this.onLogHook(entry); } catch (e) { }
        }

        // Console output
        const prefix = `[${entry.timestamp}] [${entry.levelName}] [${tag}]`;
        const hexSuffix = hex ? ` | HEX: ${hex}` : '';

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(prefix, message, hexSuffix, data ?? '');
                break;
            case LogLevel.INFO:
                console.info(prefix, message, hexSuffix, data ?? '');
                break;
            case LogLevel.WARN:
                console.warn(prefix, message, hexSuffix, data ?? '');
                break;
            case LogLevel.ERROR:
                console.error(prefix, message, hexSuffix, data ?? '');
                break;
        }
    }

    debug = (tag: string, msg: string, data?: any) => this.log(LogLevel.DEBUG, tag, msg, data);
    info = (tag: string, msg: string, data?: any) => this.log(LogLevel.INFO, tag, msg, data);
    warn = (tag: string, msg: string, data?: any) => this.log(LogLevel.WARN, tag, msg, data);
    error = (tag: string, msg: string, data?: any) => this.log(LogLevel.ERROR, tag, msg, data);

    /**
     * Log SFWU/BLE Packets with HEX dump
     */
    packet = (tag: string, direction: 'TX' | 'RX', data: Uint8Array, context?: string) => {
        const hex = this.toHex(data);
        const msg = direction === 'TX' ? `SEND ${context || ''}` : `RECV ${context || ''}`;
        // Use INFO level for packets so they arrive in standard reports
        this.log(LogLevel.INFO, tag, `${msg} (${data.length} bytes)`, undefined, hex);
    };

    /**
     * Convert Uint8Array to hex string (space separated)
     */
    toHex(arr: Uint8Array): string {
        return Array.from(arr)
            .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
    }

    getLogs = () => [...this.logs];

    clear = () => {
        this.logs = [];
        localStorage.removeItem(STORAGE_KEY);
    };

    /**
     * Build human-readable text for export
     */
    toText() {
        return this.logs.map(log => {
            const hex = log.hex ? `\n    HEX: ${log.hex}` : '';
            const data = log.data ? `\n    DATA: ${JSON.stringify(log.data)}` : '';
            return `[${log.timestamp}] [${log.levelName}] [${log.tag}] ${log.message}${hex}${data}`;
        }).join('\n');
    }

    /**
     * Trigger a .txt file download
     */
    downloadLogs() {
        const text = this.toText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `topbrewer_logs_${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    setMinLevel(level: LogLevel) {
        this.minLevel = level;
    }

    setOnLog(hook: ((entry: LogEntry) => void) | null) {
        this.onLogHook = hook;
    }
}

export const logger = new Logger();
