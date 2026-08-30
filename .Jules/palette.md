## 2026-07-29 - Keyboard Accessibility for Hold-to-Repeat Actions
**Learning:** Hold-to-repeat buttons relying only on `onMouseDown`/`onTouchStart` block keyboard-only users from triggering actions (like Emergency Stop).
**Action:** Always pair mouse/touch hold events with `onKeyDown` and `onKeyUp` for 'Enter'/'Space', explicitly guarding against native browser key-repeat spawning duplicate timers by checking a synchronous ref (e.g., `!holdTimerRef.current`).
