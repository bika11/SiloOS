
## 2026-08-10 - Prevent filtering overhead in frequent render loops
**Learning:** In complex dashboards (like DashboardScreen), frequent state updates (e.g., progress bars updating every 50ms) cause the entire component to re-render. Passing unmemoized, freshly-computed array filters to child components during these rapid updates unnecessarily blocks the main thread.
**Action:** Always memoize derived array operations (`filter`, `map`) with `useMemo` when they are passed as props to complex child components, especially in screens with high-frequency state updates like progress animations.
