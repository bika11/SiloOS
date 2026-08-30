## 2026-08-07 - Keyboard Accessibility for Hold-to-Repeat
**Learning:** Hold-to-repeat functionalities using `onMouseDown` and `onTouchStart` inherently break keyboard accessibility unless explicitly paired with `onKeyDown` and `onKeyUp` for 'Enter' and ' ' keys.
**Action:** Always implement key handlers and use a state check (e.g., `!isPressing`) to prevent the browser's native key-repeat mechanism from spawning duplicate timers.
