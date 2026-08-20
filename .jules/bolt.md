## 2026-08-20 - Memoization in High-Frequency Update Loops
**Learning:** High-frequency state updates (like the 50ms interval in the dashboard E-STOP hold event) can cause expensive derived state recalculations and re-renders of large components if they are not memoized.
**Action:** Always wrap expensive derived calculations in `useMemo`, event handlers passed to children in `useCallback`, and pure presentation components in `React.memo` when they are mounted in a component subject to frequent polling or timer-based state updates.
