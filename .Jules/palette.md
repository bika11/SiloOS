## 2026-08-09 - Keyboard accessibility for hold-to-repeat components
**Learning:** React components relying solely on `onMouseDown` and `onTouchStart` for hold-to-repeat functionality break keyboard accessibility.
**Action:** Always pair pointer events with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys. Ensure to check `!e.repeat` and conditional active state (like `isPressing`) during `onKeyDown` to prevent native browser key-repeat from spawning duplicate timers.
