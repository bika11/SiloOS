## 2024-05-24 - Memoize derived state in high-frequency render paths
**Learning:** High-frequency state updates like a 50ms hold timer can cause rapid render loops, making unmemoized array filtering expensive and potentially blocking the main thread.
**Action:** Always wrap expensive derived state operations (e.g., array filtering) in `useMemo` to prevent unnecessary re-computations during rapid re-renders.
