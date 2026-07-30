## 2026-07-30 - High-frequency render loops block on derived state
**Learning:** In components with high-frequency local state updates (like the 50ms hold timer in DashboardScreen), unmemoized derived state (like array filtering) can block the main thread and trigger cascading re-renders of child components.
**Action:** Always memoize derived state that doesn't depend on the high-frequency state, using `useMemo`, to prevent recalculation during rapid render loops.
