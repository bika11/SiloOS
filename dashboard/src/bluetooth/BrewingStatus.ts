export const BrewingStatus = {
    IDLE: 0,
    GRINDING: 1,
    TAMPING: 2,
    PRE_INFUSION: 3,
    INFUSING: 4,
    EJECTING: 5,
    DISPENSING: 6,
    PREPARING: 7,
    WARMING_UP: 8,
    COOLING_DOWN: 9,
    FILLING_WATER: 10,
    CARBONATING: 11,
    FAILED: 12,
    ABORTING: 13,
    CLEANING: 14,
    BUSY: 15,
    BREWING: 16
} as const;
