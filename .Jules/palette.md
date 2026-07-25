## 2026-07-25 - Keyboard Accessibility for Hold-to-Repeat Custom UI
**Learning:** In custom React UI components, hold-to-repeat functionality relying solely on `onMouseDown` and `onTouchStart` breaks keyboard accessibility. It prevents users navigating via keyboard from triggering the action.
**Action:** Always pair these with `onKeyDown` and `onKeyUp` handlers for 'Enter' and ' ' (Space) keys. Ensure to conditionally check state (e.g., `if (holdTimerRef.current) return;`) to prevent native browser key-repeat from spawning duplicate timers.
