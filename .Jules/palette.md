## 2026-08-19 - Keyboard Accessibility for Hold-to-Repeat Actions
**Learning:** Hold-to-repeat functionality relying purely on pointer events (mousedown/touchstart) completely breaks keyboard accessibility. When adding keydown handlers for Enter/Space, the native browser key-repeat behavior can spawn duplicate timers if not explicitly mitigated.
**Action:** Always pair pointer hold handlers with `onKeyDown` and `onKeyUp`. Explicitly check `!e.repeat` in the keydown handler and ensure a safeguard exists in the start handler (`if (timerRef.current) return;`) to prevent timer duplication.
