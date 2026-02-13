import { logger } from '../../utils/logger';
import type { BrewStatus } from '../../entities/BrewStatus';

export class BrewStatusParser {
    static parse(data: Uint8Array): BrewStatus | null {
        try {
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const decoder = new TextDecoder('utf-8');
            let offset = 0;

            // Byte 0: Brew State
            const brewState = view.getUint8(offset++);

            // Check if this is the simple payload (6 bytes)
            if (data.length <= 8) {
                // Byte 1: Progress (0-100)
                const progress = view.getUint8(offset++);
                // Byte 2-5: Order ID (Int32 Big-Endian)
                const currentOrderId = view.getInt32(offset, false);

                return {
                    brewState,
                    machineAvailable: 1, // Assume available
                    systemStatus: 2,    // Force STATE_SYSTEM_BREWING
                    error: 0,
                    currentOrderId,
                    uId: '',
                    progress // Add optional field if needed (update interface)
                };
            }

            // Fallback to complex Java-based payload (10+ bytes)
            const machineAvailable = view.getUint8(offset++);
            const systemStatus = view.getUint8(offset++);
            const error = view.getUint8(offset++);
            const currentOrderId = view.getInt32(offset, false);
            offset += 4;
            const descLen = view.getUint8(offset++);
            offset++; // Count byte
            const uIdBytes = data.slice(offset, offset + descLen);
            const uId = decoder.decode(uIdBytes);

            return {
                brewState,
                machineAvailable,
                systemStatus,
                error,
                currentOrderId,
                uId
            };

        } catch (e) {
            logger.error('TopBrewer', 'Failed to parse Brew Status', e);
            return null;
        }
    }
}
