## 2024-05-24 - Accessibility improvements for Collapsible UI elements
**Learning:** Found an interactive collapsible section (Dosing Calibration) without aria-expanded and aria-controls attributes. Screen readers rely on these to understand state and content relationships.
**Action:** When building or modifying custom collapsible sections (accordions) in the UI, ensure screen reader accessibility by using `aria-expanded` on the toggle, `aria-controls` linking to the content's `id`, and `aria-hidden="true"` on decorative state indicators.
