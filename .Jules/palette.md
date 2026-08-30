## 2026-08-08 - Keyboard accessibility for hold-to-repeat actions
**Learning:** In custom React UI components, hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility for screen readers and keyboard users.
**Action:** Always pair these with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys. Check `!e.repeat` during `onKeyDown` to prevent the browser's native key-repeat mechanism from spawning duplicate hold timers.
