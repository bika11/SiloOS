import { logger } from "../../utils/logger";

export interface BrewStatus {
    state: number;          // 0: Idle, 1: Brewing, 2: Cleaning, etc.
    machineAvailable: number; // 0/1
    systemStatus: number;   // Bitmask
    error: number;          // Error code
    progress: number;       // 0-100 (if provided by simple firmware)
    orderId: number;        // ID of current active order
}

export class BrewStatusParser {
    static parse(data: Uint8Array): BrewStatus {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let offset = 0;

        // Note: Field mapping varies by firmware length
        // Decision 35: Flexible SFWU Payload Parsing

        let state = 0;
        let machineAvailable = 0;
        let systemStatus = 0;
        let error = 0;
        let progress = 0;
        let orderId = 0;

        try {
            if (data.byteLength >= 4) {
                state = view.getUint8(offset++); // Byte 0

                // Length check for "Simple" vs "Complex"
                if (data.byteLength <= 8) {
                    // Simple Format (likely 6 bytes)
                    // [State][Progress][][][OrderId_H][OrderId_L]
                    progress = view.getUint8(offset++); // Byte 1
                    offset += 2; // Reserved
                    orderId = view.getUint16(offset, false); // Byte 4-5
                } else {
                    // Complex Format (Adjusted based on Android App Logic)
                    // [State(0)][Reserved(1)][Available(2)][SystemStatus(3)][Error(4)][OrderId(5-8)]
                    offset++; // Skip reserved byte (Index 1)

                    if (offset < data.byteLength) machineAvailable = view.getUint8(offset++); // Byte 2
                    if (offset < data.byteLength) systemStatus = view.getUint8(offset++);     // Byte 3
                    if (offset < data.byteLength) error = view.getUint8(offset++);            // Byte 4

                    if (data.byteLength >= offset + 4) {
                        orderId = view.getInt32(offset, false); // Byte 5-8
                    }
                }
            }
        } catch (e) {
            logger.error('SFWU', 'Failed to parse brew status', e instanceof Error ? e.message : String(e));
        }

        return {
            state,
            machineAvailable,
            systemStatus,
            error,
            progress,
            orderId
        };
    }

    /**
     * Map numeric state to human readable string
     */
    static stateToString(state: number): string {
        switch (state) {
            case 0: return 'Idle';
            case 1: return 'Brewing';
            case 2: return 'Cleaning';
            case 3: return 'Finished';
            case 4: return 'Ready';
            case 7: return 'Processing'; // Mapped from observation
            default: return `Unknown (${state})`;
        }
    }
}
