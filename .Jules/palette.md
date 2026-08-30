## 2024-08-03 - Accessible hold-to-repeat buttons
**Learning:** In custom React UI components, hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility.
**Action:** Always pair these with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys, and conditionally check state (like `isPressing`) to prevent native browser key-repeat from spawning duplicate timers.
