## 2026-08-18 - Keyboard Accessibility for Hold-to-Repeat Interactions
**Learning:** Hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility, as native key repeats can spawn duplicate timers.
**Action:** Always pair mouse/touch handlers with `onKeyDown` and `onKeyUp` for Enter/Space, check `!e.repeat` during keydown, and safeguard the start handler to prevent duplicate timers.
