## 2025-02-18 - First entry\n**Learning:** Accessibility and UX insight\n**Action:** Keep improving

## 2026-08-15 - Keyboard accessibility for hold-to-repeat
**Learning:** Hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility. When adding `onKeyDown` and `onKeyUp`, the browser's native key-repeat mechanism can trigger multiple events rapidly, spawning duplicate timers and causing erratic behavior.
**Action:** Always pair mouse/touch handlers with `onKeyDown` and `onKeyUp` for 'Enter' and 'Space'. To prevent native browser key-repeat from spawning duplicate timers, check `!isPressing` during `onKeyDown` before initiating the repeat sequence.
