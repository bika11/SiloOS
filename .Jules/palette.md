## 2026-08-16 - Keyboard Accessible Hold-To-Repeat Buttons
**Learning:** Hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility (Enter/Space keys).
**Action:** Always pair mouse/touch hold handlers with `onKeyDown` and `onKeyUp`. During `onKeyDown`, check `!e.repeat` to prevent native browser key-repeat from spawning duplicate timers. Ensure timers have safeguards against duplicate spawns.
