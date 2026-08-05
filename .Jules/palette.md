## 2026-08-05 - Fix Hold-to-Abort Button Keyboard Accessibility
**Learning:** Custom hold-to-repeat functionality that relies solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility, as standard `Enter` and `Space` keys natively trigger `onClick`.
**Action:** Always pair mouse and touch start/end events with `onKeyDown` and `onKeyUp` handlers for `Enter` and `Space`, conditionally checking state (like `isHolding`) to prevent native browser key-repeat from spawning duplicate timers.
