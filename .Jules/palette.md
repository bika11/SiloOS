## 2024-05-24 - Add keyboard support to hold-to-repeat buttons
**Learning:** Custom UI components that rely solely on `onMouseDown` and `onTouchStart` for "hold-to-repeat" functionality break keyboard accessibility (Space/Enter). Native key-repeats can also spawn duplicate timers if not guarded.
**Action:** Always pair these handlers with `onKeyDown` and `onKeyUp` explicitly mapping 'Enter' and ' ' (Space), and use state checks (e.g., `isPressing`) to prevent native browser key-repeat from triggering the start handler multiple times.
