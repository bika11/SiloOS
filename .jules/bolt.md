## 2024-05-24 - Memoize derived state in high-frequency update loops
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Recalculating derived state (like filtering arrays) during rapid render loops can cause main thread blocking.
**Action:** Ensure expensive derived state operations are memoized (e.g., using `useMemo`) to prevent main thread blocking during rapid render loops.
