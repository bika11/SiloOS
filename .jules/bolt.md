## 2024-07-17 - Memoize Derived State to Prevent Main Thread Blocking

**Learning:** Components with high-frequency local state updates (like the 50ms holdTimer in DashboardScreen) will re-execute all top-level component logic continuously. If derived state (like array filtering) or synchronous loggers are left unmemoized, they run on every render frame and can block the main thread, causing UI stutter.
**Action:** Always memoize derived state and wrap logging logic related to that state in useMemo (or move it to a targeted useEffect) when it lives inside a component designed for rapid render loops.
