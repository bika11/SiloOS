## 2026-02-16 - Prevent Timing Attacks on Auth Tokens
**Vulnerability:** Authentication token checks in WebSocket handler were using simple string comparison (`client_token != AUTH_TOKEN`), which allows attackers to slowly discover the token through timing side-channels.
**Learning:** Python's string equality short-circuits. When a token fails at the first character, it returns faster than if it fails at the fifth character.
**Prevention:** Always use `secrets.compare_digest()` for security-sensitive token/password matching, and explicitly handle `None` values beforehand to avoid TypeError.
