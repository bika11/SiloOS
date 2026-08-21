## 2026-08-21 - Keyboard Accessibility for Hold-to-Repeat UI
**Learning:** Custom hold-to-repeat elements relying solely on onMouseDown and onTouchStart break keyboard navigation.
**Action:** Always implement onKeyDown and onKeyUp for Space/Enter, and crucially check `!e.repeat` to prevent native key-repeat from spawning duplicate JS interval timers.
