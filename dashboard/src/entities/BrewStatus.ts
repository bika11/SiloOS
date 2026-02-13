export interface BrewStatus {
    brewState: number;          // Byte 0
    machineAvailable: number;   // Byte 1
    systemStatus: number;       // Byte 2
    error: number;              // Byte 3
    currentOrderId: number;     // Byte 4-7 (Int32 Big-Endian)
    uId: string;                // Variable length
    progress?: number;          // Byte 1 in simple payload
}
