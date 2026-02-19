/**
 * Custom Recipe Types for SiloOS
 */

export interface RecipeStep {
    /** Silo ID (e.g., '1', '2', '3') */
    siloId: string;
    /** Target weight to dispense in kg */
    targetKg: number;
}

export interface Recipe {
    /** Unique ID for the recipe */
    id: string;
    /** Human-readable name */
    name: string;
    /** Sequential steps to execute */
    steps: RecipeStep[];
    /** Timestamp of last execution */
    lastUsed?: number;
}
