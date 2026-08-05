## 2026-08-05 - Derived State in High-Frequency Renders
**Learning:** The dashboard frontend features high-frequency local state updates, such as a 50ms emergency stop hold timer. When derived state like filtering large lists isn't memoized, it recalculates on every render loop, blocking the main thread and causing jank during critical UI interactions.
**Action:** Always memoize expensive derived state operations (e.g., using `useMemo`) in components that have rapid render loops.
