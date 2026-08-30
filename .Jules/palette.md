## 2025-02-18 - Fix malformed secondary buttons
**Learning:** In the custom frontend design system, secondary button classes (e.g., `.btn-secondary`) only define color properties and must be combined with the base `.btn` class to inherit layout structure, padding, and pseudo-class behaviors like `:focus-visible`.
**Action:** Always combine the base button class with variant classes.
