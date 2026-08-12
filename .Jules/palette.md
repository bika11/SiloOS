## 2026-08-12 - Hold-to-Repeat Keyboard Accessibility
**Learning:** Custom hold-to-repeat functionality using only onMouseDown/onTouchStart completely breaks keyboard navigation for interactive elements like Steppers. Native key-repeat must be manually circumvented.
**Action:** Always pair mouse/touch handlers with onKeyDown/onKeyUp for 'Enter' and Space keys. Critically, check !e.repeat in onKeyDown to prevent duplicate spawn timers from native browser key-repeat events.
