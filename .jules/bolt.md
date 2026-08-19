## 2026-08-19 - Dashboard High-Frequency Update Re-renders
**Learning:** The Dashboard screen triggers very high-frequency (50ms) state updates during E-STOP hold events. Without memoization, this forces expensive re-evaluation of derived state (like filtering visible menu items) and unnecessary re-renders of heavy child components like the menu and recipes panel, leading to UI thread blocking.
**Action:** Always strictly memoize expensive derived state (`useMemo`) and child components (`React.memo`) that are within views subjected to high-frequency state updates.
