import { logger } from '../../utils/logger';
import type { OrderResponse } from '../../entities/OrderResponse';

export class OrderResponseParser {
    static parse(data: Uint8Array): OrderResponse | null {
        try {
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

            // Byte 0: HTTP Status (Mapped)
            const httpStatus = view.getUint8(0);

            let orderId = 0;
            // Byte 1-4: Order ID (Int32 Big-Endian)
            if (data.byteLength >= 5) {
                orderId = view.getInt32(1, false);
            }

            return {
                httpStatus,
                orderId
            };
        } catch (e) {
            logger.error('TopBrewer', 'Failed to parse Order Response', e);
            return null;
        }
    }
}
