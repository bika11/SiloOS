## 2026-02-19 - Derived State Memoization in High-Frequency Renders
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Calculating expensive derived state during these renders can block the main thread and cause UI stutter.
**Action:** Always memoize derived state operations (e.g., using `useMemo`) in components with rapid render loops, and optimize loops like N*M filters by converting arrays to Sets for O(N) lookups.
