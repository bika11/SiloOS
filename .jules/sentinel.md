## 2026-02-16 - Fail-Open Authentication Bypass
**Vulnerability:** The Python WebSocket server was written as `if AUTH_TOKEN and client_token != AUTH_TOKEN: reject()`.
**Learning:** This is a fail-open pattern. If a user set an empty token in configuration, `AUTH_TOKEN` became falsy, completely skipping the authentication check and allowing anyone to connect without a token.
**Prevention:** Always write authentication checks to fail-closed. Explicitly require a valid, non-empty, and non-default token (e.g., `if not AUTH_TOKEN or token == default or client != AUTH_TOKEN: reject()`).
