
## 2024-10-24 - High-Frequency State Updates and Derived State
**Learning:** The frontend uses high-frequency local state updates (e.g., a 50ms hold timer). If expensive derived state operations (like filtering a list of menu items) are not memoized, they will block the main thread and cause unnecessary child re-renders on every 50ms tick.
**Action:** Always wrap expensive derived state operations with `useMemo` in components that also contain high-frequency interval-based state updates.
