export interface MenuItem {
    id: number;
    n: string; // name
    gid: number; // graphic id
    p?: number; // price
    min?: number;
    nom?: number;
    max?: number;
}

export interface Menu {
    menu_items: {
        i: MenuItem[];
    };
    uid?: string;
}

export interface ParsedMenuItem {
    id: number;
    name: string;
    graphicId: number;
}

// Icon mapping (guesswork based on common IDs, can refine later)
export const DRINK_ICONS: Record<number, string> = {
    1: '☕', // Espresso
    2: '🥛', // Milk
    3: '☕🥛', // Cappuccino
    4: '🟤', // Coffee
    5: '💧', // Water
    6: '🔥', // Hot Water
    7: '🍫', // Chocolate
    // Default fallback
    0: '🥤',
};
