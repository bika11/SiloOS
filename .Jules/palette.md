## 2026-08-14 - Keyboard Accessibility for Hold-to-Repeat Custom UI
**Learning:** Custom hold-to-repeat or long-press UI components that only implement `onMouseDown` and `onTouchStart` inherently break keyboard accessibility.
**Action:** Always pair mouse and touch hold actions with `onKeyDown` and `onKeyUp` handlers targeting 'Enter' and Space keys, explicitly checking `!e.repeat` in `onKeyDown` to prevent native browser key-repeat from spawning duplicate timers.
