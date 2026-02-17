// Order Command - Coffee Order (0x00C4)
// Ported from OrderDeviceRequest.java - builds binary order payload

import { ORDER_FEATURE, SFWU_CMD } from '../constants';
import { buildRequest } from '../SFWU';

/**
 * Ingredient customization for an order
 */
export interface OrderIngredient {
    ingredientId: number;
    variantId: number;
    value: number; // 0.0 - 1.0 (will be multiplied by 100)
}

/**
 * Complete order structure
 */
export interface Order {
    menuId: number;        // -1 if not set
    cups: number;          // -1 if not set, otherwise 1+
    cupSize: number;       // -1 if not set, otherwise ml
    ingredients: OrderIngredient[];
}

/**
 * Build SFWU binary payload for coffee order
 * 
 * Format (from OrderDeviceRequest.getSFWUData):
 * - Byte 0: features_provided bitmask
 * - If MENU_ID bit set: 1 byte menu ID
 * - If CUP_COUNT bit set: 1 byte cup count
 * - If CUP_SIZE bit set: 4 bytes (cupSize * 100, big-endian)
 * - For each ingredient: 1 byte id, 1 byte variant, 4 bytes value (value * 100, big-endian)
 */
export function buildOrderPayload(order: Order): Uint8Array {
    // Calculate data length
    const hasMenuId = order.menuId !== -1;
    const hasCups = order.cups > 0;
    const hasCupSize = order.cupSize > 0;

    const varLength = (hasMenuId ? 1 : 0) + 1 + (hasCupSize ? 4 : 0);
    const ingredientSize = 6; // 1 + 1 + 4 bytes per ingredient
    const commandSize = 1; // features byte
    const dataLength = commandSize + varLength + (order.ingredients.length * ingredientSize);

    const data = new Uint8Array(dataLength);
    const view = new DataView(data.buffer);

    let offset = 1; // Start after features byte
    let featuresProvided = 0x00;

    // Menu ID (1 byte)
    if (hasMenuId) {
        data[offset++] = order.menuId & 0xff;
        featuresProvided |= ORDER_FEATURE.MENU_ID;
    }

    // Cup count (1 byte) - MANDATORY for some machines
    // If not set/invalid, default to 1 to ensure packet structure is valid
    const cups = (order.cups > 0) ? order.cups : 1;
    data[offset++] = cups & 0xff;
    featuresProvided |= ORDER_FEATURE.CUP_COUNT;

    // Cup size (4 bytes, big-endian, value * 100)
    if (hasCupSize) {
        const cupSizeScaled = Math.round(order.cupSize * 100);
        view.setUint32(offset, cupSizeScaled, false); // Explicit BIG-ENDIAN
        offset += 4;
        featuresProvided |= ORDER_FEATURE.CUP_SIZE;
    }

    // Ingredients flag
    // Standard Mode Hack: We MUST set this flag if we are converting size (hasCupSize),
    // otherwise the machine might skip the recalculation loop for 0-ingredient recipes.
    if (order.ingredients.length > 0 || hasCupSize) {
        featuresProvided |= ORDER_FEATURE.INGREDIENTS;
    }

    // Ingredients (6 bytes each)
    for (const ingredient of order.ingredients) {
        data[offset++] = ingredient.ingredientId & 0xff;
        data[offset++] = ingredient.variantId & 0xff;

        const valueScaled = Math.round(ingredient.value * 100);
        view.setUint32(offset, valueScaled, false); // Explicit BIG-ENDIAN
        offset += 4;
    }

    // Set features byte at position 0
    data[0] = featuresProvided;

    return data;
}

/**
 * Build complete SFWU order request packet
 */
export function buildOrderRequest(order: Order): Uint8Array {
    const payload = buildOrderPayload(order);
    return buildRequest(SFWU_CMD.COFFEE_ORDER, payload);
}

/**
 * Create a simple order for a menu item
 */
export function createSimpleOrder(menuId: number, cups = 1): Order {
    return {
        menuId,
        cups,
        cupSize: -1,
        ingredients: [],
    };
}
