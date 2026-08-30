## 2026-07-31 - Memoizing derived state in fast-rendering components
**Learning:** Components with high-frequency local state updates (like the 50ms hold interval in DashboardScreen) will re-run all derived state calculations on every tick. This can cause main thread blocking if filtering operations like O(N*M) menu item filtering are not memoized.
**Action:** Always memoize derived state arrays/objects with `useMemo` in components containing fast-firing `setInterval` updates or rapid render loops.
