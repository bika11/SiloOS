## 2026-07-16 - Memoization with High-Frequency Local State
 **Learning:** In React architectures using high-frequency local state updates (like the 50ms hold timer in DashboardScreen), derived state like array filtering must be memoized. Unmemoized expensive operations block the main thread and can disrupt the rendering loop for crucial UI like an emergency stop button.
 **Action:** Always look for and memoize (e.g., using `useMemo`) array filtering or mapping operations in components that contain `setInterval` or `requestAnimationFrame` state updates.
