## 2026-07-18 - Memoizing Derived State in High-Frequency Renders
**Learning:** High-frequency local state updates (like the 50ms emergency stop hold timer) cause full component re-renders. Unmemoized O(n*m) array operations (like filtering menu items against an array of hidden IDs) during these renders can block the main thread and cause UI stutter.
**Action:** Always memoize expensive derived state (`useMemo`) and optimize data structures (e.g., using `Set` instead of `Array.includes`) in components that feature rapid render loops.
