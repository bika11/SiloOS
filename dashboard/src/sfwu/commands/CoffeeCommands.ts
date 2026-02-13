// Simple Coffee Commands
// Reset, Menu Status, Brew Status, Clean, Temperatures

import { SFWU_CMD } from '../constants';
import { buildRequest } from '../SFWU';

/**
 * Build COFFEE_RESET command (0x00C0)
 * Resets/cancels the current brewing operation
 */
export function buildResetCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_RESET, new Uint8Array(0));
}

/**
 * Build COFFEE_MENU_STATUS command (0x00C1)
 * Requests the current menu status from the machine
 */
export function buildMenuStatusCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_MENU_STATUS, new Uint8Array(0));
}

/**
 * Build COFFEE_MENU command (0x00C2)
 * Requests the full menu from the machine
 */
export function buildMenuCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_MENU, new Uint8Array(0));
}

/**
 * Build COFFEE_MENU_ITEM command (0x00C3)
 * Requests a specific menu item's details
 */
export function buildMenuItemCommand(menuItemId: number): Uint8Array {
    const data = new Uint8Array(1);
    data[0] = menuItemId & 0xff;
    return buildRequest(SFWU_CMD.COFFEE_MENU_ITEM, data);
}

/**
 * Build COFFEE_BREW_STATUS command (0x00C5)
 * Requests the current brewing status
 */
export function buildBrewStatusCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_BREW_STATUS, new Uint8Array(0));
}

/**
 * Build COFFEE_TEMPERATURES command (0x00C6)
 * Requests current temperature readings from the machine
 */
export function buildTemperaturesCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_TEMPERATURES, new Uint8Array(0));
}

/**
 * Build COFFEE_CLEAN command (0x00C7)
 * Initiates a cleaning cycle
 */
export function buildCleanCommand(): Uint8Array {
    return buildRequest(SFWU_CMD.COFFEE_CLEAN, new Uint8Array(0));
}
