## 2024-07-28 - Memoize derived state during high-frequency local updates
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Any unmemoized derived state operations run in these rapid render loops, potentially blocking the main thread.
**Action:** Use useMemo for any derived state in components with high-frequency local state update loops (e.g. timers) to prevent recalculations on every render.
