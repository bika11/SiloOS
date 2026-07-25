## 2024-05-15 - High Frequency State Updates blocking main thread
**Learning:** The DashboardScreen component has an emergency stop hold button that uses `setInterval` to trigger state updates every 50ms, causing high-frequency render loops. Unmemoized derived state operations inside this component block the main thread and can cause UI stutter.
**Action:** Always wrap derived state (like array filtering) in `useMemo` when a component relies on rapid, timer-driven state updates.
