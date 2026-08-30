## 2026-07-26 - Memoize derived state during high-frequency interval re-renders
**Learning:** Components driving UI via rapid `setInterval` loops (like a 50ms emergency hold timer) will continuously trigger full re-renders, causing unmemoized array filtering (e.g., hidden menu items) to run repeatedly and waste cycles on the main thread.
**Action:** When a component uses a fast timer for UI state, ensure any non-trivial derived state computations (like `.filter()`, `.map()`, or sorting arrays) are wrapped in `useMemo` so they aren't recalculated multiple times per second unnecessarily.
