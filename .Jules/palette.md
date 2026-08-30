## 2026-07-14 - Global Focus Ring Pattern
**Learning:** For design systems with distinct brand colors (like `var(--silos-amber)`), adding a global `:focus-visible` rule with `outline-offset` is an elegant, non-intrusive way to ensure accessible keyboard navigation without cluttering component-level CSS or affecting mouse users.
**Action:** Always prefer setting a global `:focus-visible` in the base CSS using the primary brand color to ensure all interactive elements implicitly meet focus indicator accessibility requirements.
