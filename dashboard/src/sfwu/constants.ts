// SFWU Protocol Constants
// Ported from SFWU.java - Big-Endian, byte-identical to Android app

// ============================================================
// HEADER LAYOUT (12 bytes total)
// ============================================================
export const SFWU_HEADER = {
    SYNC: 0,      // 1 byte
    VER: 1,       // 1 byte
    TO: 2,        // 1 byte
    FROM: 3,      // 1 byte  
    CMD: 4,       // 2 bytes (big-endian)
    ID: 6,        // 2 bytes (big-endian)
    LENGTH: 8,    // 4 bytes (big-endian)
    DATA: 12,     // Data starts here
} as const;

export const SFWU_HEADER_SIZE = 12;
export const SFWU_FOOTER_SIZE = 4; // CRC32

// ============================================================
// PROTOCOL VALUES
// ============================================================
export const SFWU_PROT_SYNC = 0xAA;
export const SFWU_PROT_VER = 0x01;

// ============================================================
// ADDRESSES
// ============================================================
export const SFWU_ADDR = {
    INVALID: 0x00,
    CLIENT: 0x01,   // Machine (Target)
    RELAY: 0x02,    // App/PWA (matches Android SFWU_ADDR_RELAY)
    SERVER: 0x03,   // Server address
    LOGSERVER: 0x04,
} as const;

// ============================================================
// COMMANDS
// ============================================================
export const SFWU_CMD = {
    // General commands
    NOP: 0x0000,
    ECHO: 0x0001,
    VER_GET: 0x0002,
    CHUNK_GET: 0x0003,
    FWU_STATUS_GET: 0x0004,
    FWU_START: 0x0005,
    XML_DATA: 0x0006,
    TIME_GET: 0x0007,

    // JSON commands
    JSON_START_NEW: 0x00A0,
    JSON_ADDING_CONTENT: 0x00A1,
    JSON_COMPLETE: 0x00A2,

    // Settings
    SETTINGS: 0x00B0,
    APP_EVENT: 0x00B1,
    ROUTABLE_SET: 0x00B4,

    // Coffee commands (0x00Cx) - PRIMARY COMMANDS
    COFFEE_RESET: 0x00C0,
    COFFEE_MENU_STATUS: 0x00C1,
    COFFEE_MENU: 0x00C2,
    COFFEE_MENU_ITEM: 0x00C3,
    COFFEE_ORDER: 0x00C4,
    COFFEE_BREW_STATUS: 0x00C5,
    COFFEE_TEMPERATURES: 0x00C6,
    COFFEE_CLEAN: 0x00C7,
    COFFEE_RESOURCES: 0x00C9, // "os_client_cmd_coffee_resources"
} as const;

// Response commands have 0x80xx prefix
export const SFWU_CMD_RESPONSE = {
    JSON_START_NEW: 0x80A0,
    JSON_ADDING_CONTENT: 0x80A1,
    JSON_COMPLETE: 0x80A2,
    ROUTABLE_SET: 0x80B4,
} as const;

// ============================================================
// ORDER FEATURE BITMASK
// ============================================================
export const ORDER_FEATURE = {
    MENU_ID: 0x01,
    CUP_COUNT: 0x02,
    CUP_SIZE: 0x04,
    INGREDIENTS: 0x08,
} as const;

// ============================================================
// TYPE EXPORTS
// ============================================================
export type SfwuCommand = (typeof SFWU_CMD)[keyof typeof SFWU_CMD];
export type SfwuAddress = (typeof SFWU_ADDR)[keyof typeof SFWU_ADDR];
