import { logger } from '../../utils/logger';
import type { Temperatures, TemperatureSensor } from '../../entities/Temperature';

export class TemperaturesParser {
    static parse(data: Uint8Array): Temperatures | null {
        const sensors: TemperatureSensor[] = [];
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const decoder = new TextDecoder('utf-8');
        let offset = 0;

        try {
            // Byte 0 (Android uses index 1 explicitly in loop init? No, createTemperaturesDeviceResponse skips header?)
            // Android: int count = SfwuConv.toInt8(bytes, 1);
            // int offset = 2;

            // Wait, Android Byte 0 is likely unused or Command-related stripped out?
            // "byte[] bytes = SFWU.getInstance().extractData(packet);"
            // Assuming extractData removes the SFWU header.
            // Android code: "SfwuConv.toInt8(bytes, 1)" -> index 1.
            // Why index 1? What is index 0?
            // "createTemperaturesDeviceResponse(byte[] bytes)"
            // Looking at other parsers: "status = bytes[0]".

            // Let's assume Byte 0 is RESERVED or STATUS and Count is Byte 1.

            if (data.byteLength < 2) return null;

            // Android: SfwuConv.toInt8(bytes, 1);
            const count = view.getUint8(1);
            offset = 2;

            for (let i = 0; i < count; i++) {
                // initTemperatures(temp, bytes, offset)
                // off=0
                // status = bytes[offset+0]
                const status = view.getUint8(offset++);

                // temp = int32 / 100.0f (offset+1..4)
                const tempVal = view.getInt32(offset, false);
                offset += 4;
                const value = tempVal / 100.0;

                // unit = bytes[offset+5] ?? No, "offset+off++".
                // off started at 0. +1 (status) +4 (temp) = 5.
                // so unit is at offset (which is now original+5).
                const unit = view.getUint8(offset++);

                // nameLen = bytes[offset+6]
                const nameLen = view.getUint8(offset++);

                // name = string
                const nameBytes = data.slice(offset, offset + nameLen);
                const name = decoder.decode(nameBytes);
                offset += nameLen;

                sensors.push({
                    status,
                    value,
                    unit,
                    name
                });
            }

            return { sensors };
        } catch (e) {
            logger.error('TopBrewer', 'Failed to parse Temperatures', e);
            return null;
        }
    }
}
