## 2026-08-07 - Prevent Timing Attack in WebSocket Auth and Remove Hardcoded Token
**Vulnerability:** The WebSocket auth check used standard string comparison (`!=`) and hardcoded tokens, leaving it vulnerable to timing attacks and default-credential exposure.
**Learning:** Python's `secrets.compare_digest()` must be used for constant-time comparison of secrets, but it raises a TypeError if either argument is None, requiring a prior `is None` check for request parameters.
**Prevention:** Always use `secrets.compare_digest()` for token verification, add `is None` checks when handling web requests, and remove hardcoded fallback secrets in favor of environment variables.
