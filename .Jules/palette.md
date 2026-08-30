## 2026-07-30 - Stepper Keyboard Accessibility
**Learning:** Custom hold-to-repeat functionality using `onMouseDown` and `onTouchStart` breaks keyboard accessibility for screen readers and keyboard users if native keyboard events are not also bound.
**Action:** Always pair `onMouseDown`/`onTouchStart` hold-to-repeat handlers with `onKeyDown` and `onKeyUp` handlers for 'Enter' and 'Space' keys, and conditionally check state to prevent duplicate timers.
