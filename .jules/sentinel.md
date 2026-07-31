## 2026-02-19 - Timing attack vulnerability in auth token comparison
**Vulnerability:** Comparing an auth token string using `!=` instead of a constant-time comparison function, which enables timing attacks.
**Learning:** Standard string comparisons stop at the first differing character, revealing the length of the matching prefix based on execution time.
**Prevention:** Always use `secrets.compare_digest` in Python to compare auth tokens or sensitive secrets. Check for `None` to avoid `TypeError`.
