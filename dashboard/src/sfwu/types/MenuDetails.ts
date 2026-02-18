export interface MenuDetails {
    menuItemId: number;
    name?: string;
    globalMin?: number;
    globalNom?: number;
    globalMax?: number;
    carafe?: boolean;
    ingredients: Ingredient[];
}

export interface Ingredient {
    id: number;
    kind: number; // 0=Coffee, 1=Milk, 2=Water, etc.
    variants: Variant[];
}

export interface Variant {
    id: number;
    name?: string; // Added to match Android data
    isDefault: boolean;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
    scale: number; // e.g. 100 for ml, 1 for counts
    unit?: string; // Added to match Android data
}
