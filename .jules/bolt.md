## 2026-08-14 - Memoization during High-Frequency State Updates
**Learning:** In React components with high-frequency state updates (like an E-STOP button updating progress every 50ms), failing to memoize derived state (like array filtering) can block the UI thread and drop frames.
**Action:** Always memoize derived arrays and objects in views that contain rapid state changes to prevent unnecessary recalculations on every render tick.
