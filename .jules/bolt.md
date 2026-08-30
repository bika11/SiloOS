## 2025-02-16 - Memoizing Derived State in High-Frequency Render Loops
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen).
**Action:** Ensure expensive derived state operations are memoized (e.g., using `useMemo`) to prevent main thread blocking during rapid render loops.
