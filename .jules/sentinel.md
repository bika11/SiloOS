## 2025-02-18 - Auth Token Timing Attack Vulnerability
**Vulnerability:** String comparison (`!=`) was used for WebSocket auth tokens. This is vulnerable to timing attacks where an attacker can guess the token character by character.
**Learning:** `secrets.compare_digest` must be used for all secret token and password comparisons, not just basic equality operators. Also, we must explicitly check for `None` when dealing with query parameters to avoid type errors in `compare_digest`.
**Prevention:** Always use constant-time comparison functions for any secrets.
