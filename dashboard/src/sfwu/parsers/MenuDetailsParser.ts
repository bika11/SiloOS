import type { MenuDetails, Ingredient, Variant } from "../types/MenuDetails";
import { logger } from "../../utils/logger";

export class MenuDetailsParser {

    static parse(payload: Uint8Array): MenuDetails {
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const decoder = new TextDecoder('utf-8');
        let offset = 0;

        // Debug: dump raw hex
        const hex = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ');
        logger.info("SFWU", `MenuDetails RAW (${payload.length} bytes): ${hex}`);

        // --- 1. Header Info (Matches Android BLEResponseFactory.java) ---

        // Byte 0: HTTP Status (e.g. 200)
        const httpStatus = view.getUint8(offset++);

        // Byte 1: Drink ID
        const menuItemId = view.getUint8(offset++);

        // Byte 2: Graphic ID
        const graphicId = view.getUint8(offset++);

        // Debug: log both endianness for Int32s to find correct one
        logger.info("SFWU", `  Header: status=${httpStatus} id=${menuItemId} gid=${graphicId}`);
        logger.info("SFWU", `  Bytes 3-14 LE: min=${view.getInt32(3, true)} nom=${view.getInt32(7, true)} max=${view.getInt32(11, true)}`);
        logger.info("SFWU", `  Bytes 3-14 BE: min=${view.getInt32(3, false)} nom=${view.getInt32(7, false)} max=${view.getInt32(11, false)}`);

        // API confirmed Big-Endian from hex dump: 00 00 00 63 = 99
        const globalMin = view.getInt32(offset, false); offset += 4;
        const globalNom = view.getInt32(offset, false); offset += 4;
        const globalMax = view.getInt32(offset, false); offset += 4;

        // Byte 15: Carafe Mode / Reserved
        const carafe = view.getUint8(offset++);

        // Byte 16: Ingredient Count
        const ingredientCount = view.getUint8(offset++);

        // Byte 17: Name Length
        const nameLen = view.getUint8(offset++);

        // Bytes 18...: Name String
        let name = "";
        if (nameLen > 0) {
            name = decoder.decode(payload.slice(offset, offset + nameLen));
            offset += nameLen;
        }

        logger.info("SFWU", `Parsed: ID=${menuItemId} Name='${name}' Min=${globalMin} Nom=${globalNom} Max=${globalMax} Carafe=${carafe} Ingredients=${ingredientCount}`);

        const ingredients: Ingredient[] = [];

        // --- 2. Loop Ingredients ---
        for (let i = 0; i < ingredientCount; i++) {
            if (offset >= payload.byteLength) break;

            const ingId = view.getUint8(offset++);
            const variantCount = view.getUint8(offset++);

            // Android doesn't explicitly store "kind" in the loop, using ingId as kind for now
            const ingKind = ingId;

            const variants: Variant[] = [];

            // --- 3. Loop Variants ---
            for (let j = 0; j < variantCount; j++) {
                if (offset >= payload.byteLength) break;

                // Big-Endian Int32 confirmed from hex dump
                offset++; // Graphic ID
                const vMin = view.getInt32(offset, false); offset += 4;
                const vNom = view.getInt32(offset, false); offset += 4;
                const vMax = view.getInt32(offset, false); offset += 4;

                const vUnitId = view.getUint8(offset++);
                const vNameLen = view.getUint8(offset++);

                let vName = "";
                if (vNameLen > 0) {
                    vName = decoder.decode(payload.slice(offset, offset + vNameLen));
                    offset += vNameLen;
                }

                // Scale factor: Android uses Int32 / 100.0f
                const scale = 100;

                variants.push({
                    id: j, // Android uses loop index as Variant ID
                    name: vName,
                    isDefault: false, // Logic to determine default can be added later
                    defaultValue: vNom / scale,
                    min: vMin / scale,
                    max: vMax / scale,
                    step: 1, // Default step
                    scale,
                    unit: unitIdToString(vUnitId)
                });
            }

            ingredients.push({ id: ingId, kind: ingKind, variants });

            logger.debug("SFWU", `  Parsed Ingredient ID=${ingId} Kind=${ingKind} Variants=${variants.length}`);
            variants.forEach(v => {
                logger.debug("SFWU", `    -> Variant ID=${v.id} Name='${v.name}' Unit='${v.unit}' Val=${v.defaultValue} [${v.min}-${v.max}]`);
            });
        }

        const scale = 100;

        return {
            menuItemId,
            name,
            globalMin: globalMin / scale,
            globalNom: globalNom / scale,
            globalMax: globalMax / scale,
            ingredients
        };
    }
}

function unitIdToString(unitId: number): string {
    switch (unitId) {
        case 1: return "ml";
        case 2: return "g";
        case 3: return "sec";
        case 4: return "%";
        case 0: return "";
        case 10: return "ml";
        default: return `?(${unitId})`;
    }
}
