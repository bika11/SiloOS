## 2025-02-18 - Avoid O(N*M) Array Calculations on Render
**Learning:** Frequent React state updates (like for progress bars during an emergency stop hold or brew status updates) trigger expensive array recalculations on every render if not memoized. In `DashboardScreen.tsx`, `.filter` containing an `.includes` check over an array recalculates O(N*M) on every 50ms render tick.
**Action:** Always wrap derived filtering logic in `useMemo` when working with lists, and convert the filter criteria array to a `Set` to reduce time complexity to O(N).
