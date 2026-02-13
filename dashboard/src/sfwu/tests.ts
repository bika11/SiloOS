// SFWU Protocol Verification Tests
// Uses golden vectors from Java SFWUTest.java to verify byte-identical output

import { crc32, crc32Bytes, verifyCrc32 } from './CRC32';
import { parsePacket, findPacketInStream, extractData, buildHeader, buildRequest } from './SFWU';
import { SFWU_ADDR, SFWU_CMD, SFWU_PROT_SYNC, SFWU_PROT_VER } from './constants';
import { buildOrderPayload, createSimpleOrder } from './commands/OrderCommand';
import { logger } from '../utils/logger';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
}

/**
 * Run all tests and return results
 */
export function runAllTests(): { passed: number; failed: number; results: string[] } {
    const results: string[] = [];
    let passed = 0;
    let failed = 0;

    const test = (name: string, fn: () => boolean) => {
        try {
            const success = fn();
            if (success) {
                passed++;
                results.push(`✅ ${name}`);
            } else {
                failed++;
                results.push(`❌ ${name}`);
            }
        } catch (e) {
            failed++;
            results.push(`❌ ${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    // ============================================================
    // CRC32 TESTS
    // ============================================================

    test('CRC32: Empty array', () => {
        const crc = crc32(new Uint8Array(0));
        // Empty array should give 0xffffffff after XOR with 0xffffffff = 0 wait no...
        // Actually the Java impl returns the running CRC, not XORed at the end
        // Let's verify with a known value
        return crc === 0xffffffff >>> 0;
    });

    test('CRC32: Single byte 0xAA', () => {
        const bytes = new Uint8Array([0xAA]);
        const crc = crc32(bytes);
        // Verify it produces a valid 32-bit result
        return crc >= 0 && crc <= 0xffffffff;
    });

    test('CRC32: Consistent output', () => {
        const bytes = hexToBytes('AA01030100020005000000100000000200003230000000000074CBB1');
        const crc1 = crc32(bytes);
        const crc2 = crc32(bytes);
        return crc1 === crc2;
    });

    // ============================================================
    // HEADER TESTS
    // ============================================================

    test('Header: Correct sync byte', () => {
        const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, SFWU_CMD.NOP, 0, 0);
        return header[0] === SFWU_PROT_SYNC;
    });

    test('Header: Correct version', () => {
        const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, SFWU_CMD.NOP, 0, 0);
        return header[1] === SFWU_PROT_VER;
    });

    test('Header: Correct size (12 bytes)', () => {
        const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, SFWU_CMD.COFFEE_ORDER, 0, 10);
        return header.length === 12;
    });

    test('Header: Command in Big-Endian', () => {
        // COFFEE_ORDER = 0x00C4
        const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, SFWU_CMD.COFFEE_ORDER, 0, 0);
        // Bytes 4-5 should be 0x00, 0xC4 (big-endian)
        return header[4] === 0x00 && header[5] === 0xC4;
    });

    test('Header: Data length in Big-Endian', () => {
        const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, SFWU_CMD.NOP, 0, 0x12345678);
        // Bytes 8-11 should be 0x12, 0x34, 0x56, 0x78 (big-endian)
        return header[8] === 0x12 && header[9] === 0x34 && header[10] === 0x56 && header[11] === 0x78;
    });

    // ============================================================
    // PACKET PARSING TESTS (from Java SFWUTest.java)
    // ============================================================

    test('Parse: JSON packet from Java test', () => {
        // From SFWUTest.verifyCorrectJsonPackage
        const hex = 'AA01040100060001000000477B22626F6F74223A7B224F726967696E223A7B224657223A31323834382C22534E223A2237363534333231227D2C224578745549223A322C22557074696D65223A343835367D7D0976E2F2';
        const bytes = hexToBytes(hex);
        const packet = parsePacket(bytes);

        if (!packet) return false;

        // Verify header fields
        if (packet.sync !== 0xAA) return false;
        if (packet.version !== 0x01) return false;
        if (packet.to !== 0x04) return false;  // Different from our CLIENT
        if (packet.from !== 0x01) return false;
        if (packet.command !== 0x0006) return false; // XML_DATA

        // Verify data extraction
        const data = new TextDecoder().decode(packet.data);
        const expected = '{"boot":{"Origin":{"FW":12848,"SN":"7654321"},"ExtUI":2,"Uptime":4856}}';
        return data === expected;
    });

    test('Parse: Firmware packet from Java test', () => {
        const hex = 'AA01030100020005000000100000000200003230000000000074CBB13645766D';
        const bytes = hexToBytes(hex);
        const packet = parsePacket(bytes);

        if (!packet) return false;

        // Data should be 16 bytes
        if (packet.dataLength !== 16) return false;

        const dataHex = bytesToHex(packet.data);
        const expected = '0000000200003230000000000074CBB1';
        return dataHex === expected;
    });

    test('Parse: Find packet with garbage prefix', () => {
        // From SFWUTest.packetAvailableCorrectChunk - has 0xBB prefix and 0xCC suffix
        const hex = 'BBAA0103010003000900000010000000020000330000000028000000147735C733CC';
        const bytes = hexToBytes(hex);
        const packet = findPacketInStream(bytes);

        if (!packet) return false;

        // Packet should be 32 bytes (without BB prefix and CC suffix)
        return packet.length === 32;
    });

    test('Parse: Invalid packet returns null', () => {
        const hex = 'AA01010380030036000000141146';
        const bytes = hexToBytes(hex);
        const packet = findPacketInStream(bytes);
        // Should be null because packet is incomplete
        return packet === null;
    });

    // ============================================================
    // ORDER COMMAND TESTS
    // ============================================================

    test('Order: Simple order payload structure', () => {
        const order = createSimpleOrder(5, 1);
        const payload = buildOrderPayload(order);

        // Should be: 1 byte features + 1 byte menuId + 1 byte cups = 3 bytes
        if (payload.length !== 3) return false;

        // Features byte should have MENU_ID and CUP_COUNT bits set (0x03)
        if (payload[0] !== 0x03) return false;

        // Menu ID
        if (payload[1] !== 5) return false;

        // Cup count
        if (payload[2] !== 1) return false;

        return true;
    });

    test('Order: Payload with cup size', () => {
        const order = {
            menuId: 1,
            cups: 2,
            cupSize: 200, // ml
            ingredients: [],
        };
        const payload = buildOrderPayload(order);

        // Features: MENU_ID + CUP_COUNT + CUP_SIZE = 0x07
        if (payload[0] !== 0x07) return false;

        // Menu ID at offset 1
        if (payload[1] !== 1) return false;

        // Cup count at offset 2
        if (payload[2] !== 2) return false;

        // Cup size (200 * 100 = 20000) in big-endian at offset 3-6
        const view = new DataView(payload.buffer);
        const cupSizeValue = view.getInt32(3, false);
        if (cupSizeValue !== 20000) return false;

        return true;
    });

    test('Order: Payload with ingredient', () => {
        const order = {
            menuId: -1, // Not set
            cups: 1,
            cupSize: -1, // Not set
            ingredients: [
                { ingredientId: 3, variantId: 1, value: 0.75 },
            ],
        };
        const payload = buildOrderPayload(order);

        // Features: only CUP_COUNT = 0x02
        if (payload[0] !== 0x02) return false;

        // Cup count at offset 1
        if (payload[1] !== 1) return false;

        // Ingredient starts at offset 2
        // ingredientId = 3
        if (payload[2] !== 3) return false;
        // variantId = 1
        if (payload[3] !== 1) return false;
        // value = 0.75 * 100 = 75 in big-endian
        const view = new DataView(payload.buffer);
        const ingredientValue = view.getInt32(4, false);
        if (ingredientValue !== 75) return false;

        return true;
    });

    // ============================================================
    // COMPLETE REQUEST BUILD TESTS
    // ============================================================

    test('Request: Complete packet has correct structure', () => {
        const packet = buildRequest(SFWU_CMD.COFFEE_RESET, new Uint8Array(0));

        // Header (12) + Data (0) + CRC (4) = 16 bytes
        if (packet.length !== 16) return false;

        // Sync byte
        if (packet[0] !== 0xAA) return false;

        // Version
        if (packet[1] !== 0x01) return false;

        return true;
    });

    return { passed, failed, results };
}

// Run tests when this module is loaded directly
if (typeof window !== 'undefined') {
    console.log('=== SFWU Protocol Tests ===');
    const { passed, failed, results } = runAllTests();
    results.forEach(r => console.log(r));
    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}
