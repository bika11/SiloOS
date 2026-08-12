## 2026-08-12 - Memoization in High-Frequency State Views
**Learning:** Components handling high-frequency state updates (like the 50ms E-STOP hold progress in DashboardScreen) trigger excessive re-renders. Unmemoized derived state, like O(N) array filtering, is re-evaluated on every frame, which can block the main thread and cause UI stutter.
**Action:** Always strictly memoize expensive derived state calculations (e.g., array filtering) and child components within views that have rapid polling or animation intervals to prevent dropped frames.
