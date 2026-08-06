## 2026-08-06 - Keyboard accessibility for custom hold buttons
**Learning:** Custom hold-to-repeat buttons relying on onMouseDown/onTouchStart are inaccessible via keyboard unless paired with onKeyDown/onKeyUp. Browsers natively fire multiple keydown events when holding Enter/Space.
**Action:** Always add onKeyDown/onKeyUp handling for Enter/Space on custom interactive components, and verify a hold guard (e.g., checking if the timer is already running) is in place to prevent duplicate actions from native key-repeat.
