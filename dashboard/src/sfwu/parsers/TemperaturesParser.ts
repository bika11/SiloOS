import { logger } from "../../utils/logger";
import type { TemperatureSensor } from "../../entities/Temperature";

export class TemperaturesParser {
    static parse(data: Uint8Array): TemperatureSensor[] {
        const sensors: TemperatureSensor[] = [];
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const decoder = new TextDecoder('utf-8');
        let offset = 0;

        try {
            if (data.byteLength < 2) return [];

            // Header usually contains a status/reserved byte and a count
            // const _globalStatus = view.getUint8(offset++); // Commented out as per instruction
            offset++; // Increment offset to account for the skipped byte
            const count = view.getUint8(offset++);

            for (let i = 0; i < count; i++) {
                if (offset >= data.byteLength) break;

                const status = view.getUint8(offset++);
                const rawValue = view.getInt32(offset, false);
                offset += 4;
                const unitId = view.getUint8(offset++);
                const nameLen = view.getUint8(offset++);

                let name = "";
                if (nameLen > 0) {
                    name = decoder.decode(data.slice(offset, offset + nameLen));
                    offset += nameLen;
                }

                sensors.push({
                    status,
                    value: rawValue / 100.0,
                    unit: unitIdToString(unitId),
                    name
                });
            }
        } catch (e) {
            logger.error('SFWU', 'Failed to parse temperatures', e);
        }

        return sensors;
    }
}

function unitIdToString(unitId: number): string {
    switch (unitId) {
        case 1: return "°C";
        case 2: return "°F";
        default: return "";
    }
}
