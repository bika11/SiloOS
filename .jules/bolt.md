## 2026-08-01 - Memoizing Derived State in High-Frequency Update Paths
**Learning:** High-frequency local state updates (like the 50ms emergency stop hold timer in DashboardScreen) cause rapid render loops. If expensive derived state operations (like filtering an entire menu) are not memoized, they run on every frame, which can block the main thread and cause UI stutter during critical interactions.
**Action:** Always use `useMemo` for expensive derived state calculations in components that contain high-frequency interval-based state updates.
