## 2026-08-07 - Memoization in High-Frequency Render Loops
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Unmemoized derived state (like array filtering) blocks the main thread during these rapid render loops.
**Action:** Ensure expensive derived state operations are memoized (e.g., using useMemo) when placed in components that experience high-frequency state updates, preventing unnecessary child component re-renders.
