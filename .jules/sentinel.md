## 2026-08-17 - Enforce Secure Authentication Token Configuration
**Vulnerability:** Hardcoded secret 'silo-secret' was used as the default fallback for WebSocket authentication.
**Learning:** Hardcoded default credentials create a "fail open" scenario. Unconfigured systems connect but remain vulnerable to anyone who knows the default codebase values.
**Prevention:** Always use placeholder defaults (e.g., 'CHANGE_ME') paired with explicit runtime enforcement that throws an error, adhering to the "fail securely" principle.
