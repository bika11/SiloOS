## 2026-02-18 - Prevent Timing Attacks in Token Comparison
**Vulnerability:** The authentication token was compared using a standard string inequality check (`!=`), which is vulnerable to timing attacks as it fails fast upon finding the first mismatched character.
**Learning:** Python's default string comparison operators do not execute in constant time. When comparing secrets or tokens, even local ones, they must be checked securely to prevent side-channel leaks of the expected token length and content.
**Prevention:** Always use `secrets.compare_digest()` for comparing security tokens, API keys, or passwords. Explicitly check if the user-provided token is `None` before comparison to avoid TypeErrors.
