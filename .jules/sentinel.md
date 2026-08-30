## 2025-07-26 - Timing Attack in WebSocket Authentication
**Vulnerability:** String comparison (`!=`) was used for WebSocket auth tokens.
**Learning:** Using simple string comparison for auth tokens exposes the system to timing attacks, where the time taken to reject a token reveals information about the correct token's characters.
**Prevention:** Always use constant-time comparison functions like `secrets.compare_digest` for sensitive tokens and check for `None` before comparing to avoid type errors.
