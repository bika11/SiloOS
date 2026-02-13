import { logger } from "../../utils/logger";
import type { ParsedMenuItem } from "../../entities/Menu";

export class MenuParser {
    static parse(data: Uint8Array): ParsedMenuItem[] {
        const items: ParsedMenuItem[] = [];
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const decoder = new TextDecoder('utf-8');
        let offset = 0;

        try {
            if (data.byteLength < 3) return [];
            // Header
            const status = view.getUint8(offset++);
            const descLen = view.getUint8(offset++);
            const count = view.getUint8(offset++);

            // Skip UID (descLen)
            offset += descLen;

            logger.debug('SFWU', `Binary Menu: Count=${count}, Status=${status}`);

            for (let i = 0; i < count; i++) {
                if (offset >= data.byteLength) break;

                const id = view.getUint8(offset++);
                const gid = view.getUint8(offset++);

                // Price (2 bytes)
                // const _price = view.getUint16(offset, false); // Big-Endian
                offset += 2;

                const nameLen = view.getUint8(offset++);
                const nameBytes = data.slice(offset, offset + nameLen);
                const name = decoder.decode(nameBytes);
                offset += nameLen;

                items.push({
                    id: id,
                    name: name,
                    graphicId: gid
                });
            }
        } catch (e) {
            logger.error('SFWU', 'Failed to parse binary menu', e);
        }

        return items;
    }
}
