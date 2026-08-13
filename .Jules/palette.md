## 2026-08-13 - Keyboard Accessibility for Hold-to-Repeat UI
**Learning:** Hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility for screen readers and keyboard users.
**Action:** Always pair these with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys, and check `!e.repeat` during `onKeyDown` (or conditionally check state like `isPressing`) to prevent native browser key-repeat from spawning duplicate timers. Ensure to include `onBlur` to stop the action.
