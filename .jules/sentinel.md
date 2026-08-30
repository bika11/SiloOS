## 2026-07-28 - Timing Attack in Auth Token Verification
**Vulnerability:** The authentication token from the query parameter in the WebSocket handler was compared against the stored `AUTH_TOKEN` using a standard string equality operator (`!=`), which is vulnerable to timing attacks.
**Learning:** Standard string comparison operators return immediately upon finding a mismatched character. This allows attackers to guess a secret character-by-character by measuring the time it takes for the comparison to fail.
**Prevention:** Always use `secrets.compare_digest` for comparing sensitive strings like authentication tokens, passwords, or API keys. Ensure to check if the provided token is `None` before calling `compare_digest` to prevent a `TypeError`.
