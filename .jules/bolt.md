## 2024-07-27 - High-Frequency Local State in Dashboard
**Learning:** The dashboard has a 50ms interval for emergency stop holding, which triggers rapid local state updates. This causes the entire component to re-render 20 times per second, recalculating derived state (like array filtering) repeatedly.
**Action:** Always memoize derived state (e.g., using `useMemo`) in components that have high-frequency local state updates to prevent main thread blocking during rapid render loops.
