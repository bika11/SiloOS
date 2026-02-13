export interface TemperatureSensor {
    status: number;
    value: number; // Parsed float (Int32 / 100.0)
    unit: number;  // or string if decoded
    name: string;
}

export interface Temperatures {
    sensors: TemperatureSensor[];
}
