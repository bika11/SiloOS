## 2026-08-09 - Memoize derived state in high-frequency React render loops
**Learning:** In components with rapid state updates (like DashboardScreen with its 50ms holdProgress timer), recalculating derived state (like array filtering) on every render can block the main thread and cause UI stutter.
**Action:** Always wrap expensive derived state operations in `useMemo` when they rely on props or state that don't change frequently, especially when the component handles high-frequency local state updates.
