## 2024-07-30 - Fix timing attack in token comparison
**Vulnerability:** Used simple string equality (`!=`) for token comparison in WebSocket auth.
**Learning:** Python's string equality short-circuits, allowing attackers to measure comparison time and guess the token character by character (timing attack).
**Prevention:** Always use `secrets.compare_digest` for comparing secrets/tokens in Python, and remember to check for `None` before comparison to avoid TypeErrors.
