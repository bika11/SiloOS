export interface TemperatureSensor {
    status: number;
    value: number; // Parsed float (Int32 / 100.0)
    unit: string;  // Decoded unit string (°C, °F, etc.)
    name: string;
}

/** Temperature response is an array of sensors */
export type Temperatures = TemperatureSensor[];
