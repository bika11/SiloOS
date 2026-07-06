## 2024-07-06 - Stepper Keyboard Accessibility
**Learning:** Custom interactive components like `Stepper` that rely on `onMouseDown`/`onTouchStart` for repeated actions completely break keyboard accessibility if `onKeyDown`/`onKeyUp` equivalents aren't implemented. Enter/Space key behavior must manually trigger the repeat logic while preventing default form submission.
**Action:** Always map mouse/touch start events to `onKeyDown` (Space/Enter) and end events to `onKeyUp`/`onBlur` for custom UI controls.
