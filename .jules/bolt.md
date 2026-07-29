## 2024-07-29 - Memoize derived state in high-frequency render paths
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Any expensive derived state operations like filtering lists on each render will cause unnecessary computations and potentially block the main thread during rapid render loops.
**Action:** Always memoize derived state operations (e.g., using useMemo) in components that are subject to high-frequency rendering to prevent performance bottlenecks.
