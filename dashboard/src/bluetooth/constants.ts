// Bluetooth GATT UUIDs for TopBrewer
// Ported from BLEDeviceController.java

// ============================================================
// SERVICES
// ============================================================
export const SERVICES = {
    // Standard Bluetooth services
    GENERIC_ACCESS: '00001800-0000-1000-8000-00805f9b34fb',
    DEVICE_INFORMATION: '0000180a-0000-1000-8000-00805f9b34fb',

    // TopBrewer custom services
    BASE: 'c0ffee00-2624-46ff-9311-4d7083160000',
    DRINKS_MENU: 'c0ffee00-2624-46ff-9311-4d7083160100',
    MACHINE: 'c0ffee00-2624-46ff-9311-4d7083160300',
    BREW_STATUS: 'c0ffee00-2624-46ff-9311-4d7083160400',
    ORDER: 'c0ffee00-2624-46ff-9311-4d7083160500',
    // BooKoo Scale service
    SCALE: '0000ffe0-0000-1000-8000-00805f9b34fb',
} as const;

// ============================================================
// CHARACTERISTICS
// ============================================================
export const CHARACTERISTICS = {
    // Base service
    MACHINE_API_VERSION: 'c0ffee00-2624-46ff-9311-4d7083160001',

    // Drinks Menu service
    DRINKS: 'c0ffee00-2624-46ff-9311-4d7083160201',
    DRINKS_DID_CHANGE: 'c0ffee00-2624-46ff-9311-4d7083160202',

    // Machine service
    LOCAL_NAME: 'c0ffee00-2624-46ff-9311-4d7083160302',
    PAYMENT_SYSTEMS: 'c0ffee00-2624-46ff-9311-4d7083160303',
    SFWU_CHANNEL: 'c0ffee00-2624-46ff-9311-4d7083160330',

    // Brew Status service
    BREW_STATUS: 'c0ffee00-2624-46ff-9311-4d7083160401',
    DRINK_AVAILABILITIES: 'c0ffee00-2624-46ff-9311-4d7083160403',

    // Order service
    SET_ORDER: 'c0ffee00-2624-46ff-9311-4d7083160501',
    MAGIC_KEY: 'c0ffee00-2624-46ff-9311-4d7083160502',
    START_SESSION: 'c0ffee00-2624-46ff-9311-4d7083160503',
    SESSION_TIMEOUT: 'c0ffee00-2624-46ff-9311-4d7083160504',

    // Device Information
    SERIAL_NUMBER: '00002a25-0000-1000-8000-00805f9b34fb',

    // BooKoo Scale characteristics
    SCALE_DATA: '0000ffe1-0000-1000-8000-00805f9b34fb',
} as const;

// ============================================================
// DEVICE FILTERS
// ============================================================
export const TOPBREWER_NAME_PREFIX = 'TopBrewer';

// Service UUIDs to request during scanning
export const SCAN_SERVICES = [
    SERVICES.ORDER, // Primary service for ordering
    SERVICES.MACHINE, // For SFWU commands
    SERVICES.DRINKS_MENU, // For fetching menu
    SERVICES.SCALE, // For BooKoo scale
];

// ============================================================
// BLE CONSTANTS
// ============================================================
export const BLE_MTU_DEFAULT = 20; // Default MTU without negotiation
export const BLE_MTU_MAX = 512; // Maximum possible MTU
