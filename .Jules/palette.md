## 2024-07-26 - Keyboard Accessibility for Hold-to-Repeat Buttons
**Learning:** Hold-to-repeat functionality that relies exclusively on `onMouseDown` and `onTouchStart` breaks keyboard accessibility for users navigating via 'Enter' or 'Space'.
**Action:** Always pair `onMouseDown`/`onTouchStart` with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space), and ensure state (e.g., `isPressing` or `isHolding`) is checked to prevent native browser key-repeat from spawning duplicate timers.
