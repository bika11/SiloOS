/**
 * Custom Recipe Types for SiloOS
 */

export interface RecipeStep {
    menuId: number;       // Machine drink ID (from ParsedMenuItem.id)
    menuName: string;     // Cached display name (from ParsedMenuItem.name)
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
