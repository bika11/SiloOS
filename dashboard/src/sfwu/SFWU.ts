// SFWU Packet Builder and Parser
// Ported from SFWU.java - builds binary packets for BLE transmission

import { crc32Bytes, verifyCrc32 } from './CRC32';
import {
    SFWU_HEADER_SIZE,
    SFWU_FOOTER_SIZE,
    SFWU_PROT_SYNC,
    SFWU_PROT_VER,
    SFWU_HEADER,
    SFWU_ADDR,
    type SfwuCommand,
} from './constants';
import { logger } from '../utils/logger';

/**
 * Parsed SFWU packet structure
 */
export interface SfwuPacket {
    sync: number;
    version: number;
    to: number;
    from: number;
    command: number;
    id: number;
    dataLength: number;
    data: Uint8Array;
    crc: Uint8Array;
    raw: Uint8Array;
}

/**
 * Build SFWU header (12 bytes)
 * CRITICAL: Uses Big-Endian for multi-byte fields
 */
export function buildHeader(
    to: number,
    from: number,
    cmd: number,
    id: number,
    dataLength: number
): Uint8Array {
    const header = new Uint8Array(SFWU_HEADER_SIZE);
    const view = new DataView(header.buffer);

    header[SFWU_HEADER.SYNC] = SFWU_PROT_SYNC;   // 0xAA
    header[SFWU_HEADER.VER] = SFWU_PROT_VER;     // 0x01
    header[SFWU_HEADER.TO] = to;
    header[SFWU_HEADER.FROM] = from;
    view.setUint16(SFWU_HEADER.CMD, cmd, false);  // Big-endian
    view.setUint16(SFWU_HEADER.ID, id, false);    // Big-endian
    view.setUint32(SFWU_HEADER.LENGTH, dataLength, false); // Big-endian

    return header;
}

/**
 * Build complete SFWU request packet
 * Format: [Header 12B] + [Data] + [CRC32 4B]
 */
export function buildRequest(cmd: SfwuCommand, data: Uint8Array): Uint8Array {
    const id = 0x0000;

    // Build header: to=CLIENT (0x01 Machine), from=RELAY (0x02 App/PWA)
    // Ref: SFWU.java line 128 - buildHeader(SFWU_ADDR_CLIENT, SFWU_ADDR_RELAY, ...)
    const header = buildHeader(SFWU_ADDR.CLIENT, SFWU_ADDR.RELAY, cmd, id, data.length);

    // Combine header + data
    const headerAndData = new Uint8Array(SFWU_HEADER_SIZE + data.length);
    headerAndData.set(header, 0);
    headerAndData.set(data, SFWU_HEADER_SIZE);

    // Calculate CRC (using our fixed 1:1 algorithm)
    const crc = crc32Bytes(headerAndData);

    // Final packet
    const packet = new Uint8Array(SFWU_HEADER_SIZE + data.length + SFWU_FOOTER_SIZE);
    packet.set(headerAndData, 0);
    packet.set(crc, SFWU_HEADER_SIZE + data.length);

    logger.packet('SFWU', 'TX', packet);
    return packet;
}

/**
 * Parse an SFWU packet from raw bytes
 * Returns null if packet is invalid structure (length/headers)
 * Returns packet with valid=false if CRC fails
 */
export function parsePacket(raw: Uint8Array): SfwuPacket | null {
    // Minimum packet size: header + footer
    if (raw.length < SFWU_HEADER_SIZE + SFWU_FOOTER_SIZE) {
        return null;
    }

    // Verify sync byte
    if (raw[SFWU_HEADER.SYNC] !== SFWU_PROT_SYNC) {
        return null;
    }

    // Verify protocol version
    if (raw[SFWU_HEADER.VER] !== SFWU_PROT_VER) {
        return null;
    }

    const view = new DataView(raw.buffer, raw.byteOffset);
    const dataLength = view.getUint32(SFWU_HEADER.LENGTH, false);

    // Verify packet length
    const expectedLength = SFWU_HEADER_SIZE + dataLength + SFWU_FOOTER_SIZE;
    if (raw.length < expectedLength) {
        return null;
    }

    // Verify CRC
    if (!verifyCrc32(raw, dataLength)) {
        logger.warn('SFWU', 'CRC32 verification failed');
    }

    const packet: SfwuPacket = {
        sync: raw[SFWU_HEADER.SYNC],
        version: raw[SFWU_HEADER.VER],
        to: raw[SFWU_HEADER.TO],
        from: raw[SFWU_HEADER.FROM],
        command: view.getUint16(SFWU_HEADER.CMD, false),
        id: view.getUint16(SFWU_HEADER.ID, false),
        dataLength,
        data: raw.slice(SFWU_HEADER_SIZE, SFWU_HEADER_SIZE + dataLength),
        crc: raw.slice(SFWU_HEADER_SIZE + dataLength, SFWU_HEADER_SIZE + dataLength + 4),
        raw,
    };

    logger.packet('SFWU', 'RX', raw);
    return packet;
}

/**
 * Extract data payload from a validated packet
 */
export function extractData(packet: Uint8Array): Uint8Array {
    const view = new DataView(packet.buffer, packet.byteOffset);
    const dataLength = view.getUint32(SFWU_HEADER.LENGTH, false);
    return packet.slice(SFWU_HEADER_SIZE, SFWU_HEADER_SIZE + dataLength);
}

/**
 * Find a complete packet in a byte stream
 * Returns the packet data and its offset, or null
 */
export function findPacketInStream(stream: Uint8Array): { offset: number; data: Uint8Array } | null {
    for (let i = 0; i < stream.length; i++) {
        if (stream[i] === SFWU_PROT_SYNC) {
            // Need at least header to read data length
            if (stream.length < i + SFWU_HEADER_SIZE) {
                return null;
            }

            const view = new DataView(stream.buffer, stream.byteOffset + i);
            const dataLength = view.getUint32(SFWU_HEADER.LENGTH, false);

            if (dataLength < 0 || dataLength > 5000) continue; // Sanity check

            const packetSize = SFWU_HEADER_SIZE + dataLength + SFWU_FOOTER_SIZE;
            if (stream.length < i + packetSize) {
                return null; // Partial packet, wait for more
            }

            return {
                offset: i,
                data: stream.slice(i, i + packetSize)
            };
        }
    }
    return null;
}
