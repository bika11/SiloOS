## 2026-07-21 - High-Frequency Local State Bottleneck in DashboardScreen
**Learning:** The dashboard frontend uses rapid local state updates (like the 50ms interval for the emergency stop timer) which can cause the main thread to block if derived state (like filtering menuItems) is re-evaluated on every tick.
**Action:** Always memoize expensive derived state computations (e.g., using useMemo) in components that are subject to high-frequency state updates, specifically in hardware-interfacing UI components.
