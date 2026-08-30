## 2025-02-23 - Memoization in High-Frequency Render Loops
**Learning:** High-frequency local state updates (like a 50ms interval hold timer) in React components can cause significant performance bottlenecks if derived state operations (like filtering a list of menu items against an array of hidden IDs) are not memoized, leading to repeated work on the main thread and potential UI stutter.
**Action:** Always wrap expensive derived state calculations, especially list filtering or mapping, in `useMemo` within components that have rapidly changing local state.
