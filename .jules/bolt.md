## 2026-07-13 - Memoization in High-Frequency Render Loops
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Without memoization, expensive derived state operations during these loops block the main thread and cause UI stutter.
**Action:** Ensure expensive derived state operations are memoized (e.g., using `useMemo`) in components that have rapid local state updates or timers.
