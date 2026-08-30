## 2026-08-08 - Memoize high-frequency local state updates
**Learning:** The dashboard frontend features high-frequency local state updates (e.g., a 50ms emergency stop hold timer in DashboardScreen). Any expensive derived state operations like filtering array structures will run every 50ms.
**Action:** Ensure expensive derived state operations are memoized (e.g., using useMemo) to prevent main thread blocking during rapid render loops.
