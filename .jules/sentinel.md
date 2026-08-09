## 2026-08-09 - Externalize Hardcoded Token & Fix Timing Attack
**Vulnerability:** A hardcoded token `silo-secret` was present across the frontend and backend, acting as a static credential. Also, token validation was vulnerable to timing attacks using standard string comparison.
**Learning:** Hardcoding credentials in config templates or defaults creates an immediate security gap. In addition, using `!=` for token comparison exposes the application to timing side-channels.
**Prevention:** Always use environment variables with secure fallback defaults like `CHANGE_ME` for configuration, and validate authentication tokens using `secrets.compare_digest` to prevent timing attacks.
