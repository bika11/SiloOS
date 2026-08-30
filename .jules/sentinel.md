## 2026-02-19 - Timing Attack Vulnerability in WebSocket Authentication
**Vulnerability:** A standard string equality check (`!=`) was used to verify the WebSocket authentication token (`client_token != AUTH_TOKEN`). This is vulnerable to timing attacks.
**Learning:** When comparing auth tokens, always use a constant-time comparison. Also, explicitly check if the input token is `None` before using `secrets.compare_digest` to prevent a `TypeError` which could lead to DoS or bypasses depending on error handling.
**Prevention:** Use `secrets.compare_digest` for all cryptographic or authentication secret comparisons, and always validate input types (handling `None`).
