## 2024-07-17 - A11y Pattern: Icon-Only Buttons
**Learning:** Found multiple instances where symbolic or icon-only buttons (like step-sequencer +, -, ✕ or emojis) missed explicit screen reader labels.
**Action:** Always combine descriptive `aria-label`s on the button with `aria-hidden="true"` on the icon/emoji to provide accessible descriptions while avoiding screen reader noise.
