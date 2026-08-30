## 2024-07-10 - Focus states in custom design system
**Learning:** Found that the custom design system (buttons with `.btn`) lacked a keyboard focus outline (`:focus-visible`), making keyboard navigation very difficult. Similarly, some icon-only buttons lacked `aria-label` attributes even if they had a `title`.
**Action:** Ensure all interactive elements in custom design systems have explicit `:focus-visible` styles using the brand's primary color, and add `aria-label` to all icon-only buttons even if a `title` exists.
