## 2024-05-15 - Keyboard Accessibility for Hold-to-Repeat Interactions
**Learning:** Hold-to-repeat functionality relying solely on onMouseDown and onTouchStart breaks keyboard accessibility for users relying on keyboard navigation. Furthermore, native browser key-repeat can spawn duplicate timers if not handled properly.
**Action:** Always pair mouse/touch handlers with onKeyDown and onKeyUp for 'Enter' and ' ' (Space), and crucially, conditionally check state (e.g., isPressing, isHolding) to prevent native browser key-repeat from spawning duplicate timers.
