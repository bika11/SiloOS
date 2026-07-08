## 2025-07-08 - Amplified cost of unmemoized arrays in hot UI loops
**Learning:** High-frequency state updates (like 50ms intervals in the emergency stop UI) severely amplify the cost of unmemoized O(n*m) filtering operations and render-path side-effects (like logging).
**Action:** Always memoize derived lists and ensure logging/side-effects are in `useEffect` when dealing with UI components that use high-frequency polling/timers, like `setInterval` or continuous interaction handlers.
