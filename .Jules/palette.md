## 2026-07-31 - Keyboard Accessibility for Hold-to-Repeat Actions
**Learning:** In custom React UI components, hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility, as keyboard interactions are not captured, making features inaccessible to keyboard users.
**Action:** Always pair these with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys. Conditionally check state (like `!isPressing` or `!isHolding`) to prevent native browser key-repeat from spawning duplicate timers.
