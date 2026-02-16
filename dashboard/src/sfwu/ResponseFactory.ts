import { SFWU_CMD } from './constants';
import { CHARACTERISTICS } from '../bluetooth/constants';
import { MenuDetailsParser } from './parsers/MenuDetailsParser';
import { MenuParser } from './parsers/MenuParser';
import { BrewStatusParser } from './parsers/BrewStatusParser';
import { OrderResponseParser } from './parsers/OrderResponseParser';
import { TemperaturesParser } from './parsers/TemperaturesParser';
import { logger } from '../utils/logger';

export type ResponseType = 'MENU' | 'MENU_ITEM_DETAILS' | 'ORDER_RESPONSE' | 'BREW_STATUS' | 'TEMPERATURES' | 'HEARTBEAT' | 'UNKNOWN';

export interface ParsedSfwuResponse {
    type: ResponseType;
    data: any;
}

export class ResponseFactory {
    /**
     * Parse SFWU packet data based on command
     */
    static parseSfwuPacket(command: number, data: Uint8Array): ParsedSfwuResponse {
        try {
            switch (command) {
                // Menu (0x00C2 or 0x80C2)
                case SFWU_CMD.COFFEE_MENU:
                case 0x80C2:
                    return { type: 'MENU', data: MenuParser.parse(data) };

                // Menu Item Details (0x00C3 or 0x80C3)
                // Details come via multipart XML (A0/A1/A2) or per-drink BLE characteristic
                // CMD=0x0002 is a machine status broadcast — NOT menu item details
                case SFWU_CMD.COFFEE_MENU_ITEM:
                case 0x80C3:
                    return { type: 'MENU_ITEM_DETAILS', data: MenuDetailsParser.parse(data) };

                // Order Response (0x00C4 or 0x80C4)
                case SFWU_CMD.COFFEE_ORDER:
                case 0x80C4:
                    return { type: 'ORDER_RESPONSE', data: OrderResponseParser.parse(data) };

                // Brew Status (0x00C5 or 0x80C5)
                case SFWU_CMD.COFFEE_BREW_STATUS:
                case 0x80C5:
                    return { type: 'BREW_STATUS', data: BrewStatusParser.parse(data) };

                // Temperatures (0x00C6 or 0x80C6)
                case SFWU_CMD.COFFEE_TEMPERATURES:
                case 0x80C6:
                    return { type: 'TEMPERATURES', data: TemperaturesParser.parse(data) };

                // Resource Counters (0x00C9 or 0x80C9)
                case SFWU_CMD.COFFEE_RESOURCES:
                case 0x80C9:
                    // Payload: 6 bytes [00 00 01 00 02 00]
                    return { type: 'TEMPERATURES', data: data }; // Use TEMPERATURES as a generic data carrier for now or implement dedicated entities

                // Time Get / Heartbeat (0x0007)
                case SFWU_CMD.TIME_GET:
                    // Machine requesting time sync / heartbeat
                    return { type: 'HEARTBEAT', data: null };

                default:
                    return { type: 'UNKNOWN', data: null };
            }
        } catch (e) {
            logger.error('SFWU', `Failed to parse command 0x${command.toString(16).toUpperCase()}`, e);
            return { type: 'UNKNOWN', data: null };
        }
    }

    /**
     * Parse direct characteristic reads (e.g. DRINKS)
     */
    static parseCharacteristic(uuid: string, data: Uint8Array): ParsedSfwuResponse {
        const normalizedUuid = uuid.toLowerCase();
        if (normalizedUuid === CHARACTERISTICS.DRINKS) {
            return { type: 'MENU', data: MenuParser.parse(data) };
        }
        if (normalizedUuid === CHARACTERISTICS.BREW_STATUS) {
            return { type: 'BREW_STATUS', data: BrewStatusParser.parse(data) };
        }
        return { type: 'UNKNOWN', data: null };
    }
}
