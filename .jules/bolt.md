## 2026-07-23 - Memoizing Derived State in High-Frequency Render Loops
**Learning:** High-frequency local state updates (like a 50ms emergency stop hold timer) cause the entire component to re-render rapidly. If derived state operations (like array filtering) aren't memoized, they block the main thread and cause UI stutter during the loop.
**Action:** Always wrap expensive derived state operations in useMemo() when a component contains high-frequency state updates (e.g. interval-driven progress bars or hold timers).
