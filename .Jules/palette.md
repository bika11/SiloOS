## 2024-07-27 - Keyboard Accessible Hold-to-Repeat
**Learning:** Hold-to-repeat functionality that relies solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility for interactive components like steppers.
**Action:** Always pair mouse/touch handlers with `onKeyDown` and `onKeyUp` for 'Enter' and ' ' (Space) keys, and ensure you conditionally check state (like using a ref for `isPressing`) to prevent native browser key-repeat from spawning duplicate timers.
