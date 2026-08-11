/**
 * Shared weight formatting for the dashboard.
 *
 * The Laumas scale resolves ~0.1 kg, so 1 decimal is the honest default for
 * live/summary displays (showing 3 decimals implies a precision the sensor
 * doesn't have). Pass `decimals` where finer detail is genuinely useful (e.g.
 * a completed-dose result grid). Use this everywhere instead of ad-hoc
 * `toFixed(...)` + unit strings so panels stay consistent.
 */

/** `"46.2 kg"` — value + unit. */
export function formatKg(kg: number, decimals = 1): string {
    return `${kgValue(kg, decimals)} kg`;
}

/** `"46.2"` — value only (unit rendered separately in the markup). */
export function kgValue(kg: number, decimals = 1): string {
    // Avoid "-0.0" for tiny negative rounding.
    const v = Object.is(kg, -0) ? 0 : kg;
    const s = v.toFixed(decimals);
    return s === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : s;
}
