## 2026-08-11 - Memoization in High-Frequency State Components
**Learning:** Components with high-frequency state updates (like 50ms timers for UI interactions) will re-render continuously. Expensive derived state calculations (like nested array filtering) inside these components must be memoized to prevent UI thread blocking during critical interactions (like an Emergency Stop).
**Action:** Always check for unmemoized O(N) or O(N²) operations in components that contain `setInterval` or rapid state updates, and optimize array `.includes()` to `Set.has()` when filtering.
