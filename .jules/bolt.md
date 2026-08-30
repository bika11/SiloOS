## 2024-07-22 - High-Frequency Render Loops in UI

**Learning:** The frontend uses high-frequency `setInterval` loops (e.g., 50ms) for local state like button hold timers. This causes rapid component re-renders that execute all un-memoized derived state calculations (like array filtering) on every tick, which can block the main thread and cause UI stutter.
**Action:** Always wrap expensive derived state (especially list filtering/mapping) in `useMemo` when a component contains high-frequency local state updates or animation loops.
