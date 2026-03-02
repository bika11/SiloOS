import { logger } from "../../utils/logger";
import type { OrderResponse } from "../../entities/OrderResponse";

export class OrderResponseParser {
    static parse(data: Uint8Array): OrderResponse {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let offset = 0;

        let status = 0;
        let orderId = 0;

        try {
            if (data.byteLength >= 1) {
                status = view.getUint8(offset++); // Byte 0 (e.g. 200)
            }
            if (data.byteLength >= 5) {
                orderId = view.getInt32(offset, false); // Bytes 1-4
            }
        } catch (e) {
            logger.error('SFWU', 'Failed to parse order response', e);
        }

        return { status, orderId };
    }
}
