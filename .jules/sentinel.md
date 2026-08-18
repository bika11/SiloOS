## 2026-08-18 - Enforcing Secure Defaults
**Vulnerability:** A hardcoded authentication token `silo-secret` was used as a fallback and shared publicly across the client and server.
**Learning:** Using a known default token as a fallback value allows out-of-the-box local connections but introduces a critical security vulnerability if left unchanged in production, as attackers can bypass authentication.
**Prevention:** When migrating default credentials or tokens to environment variables with default placeholders (e.g., `CHANGE_ME`), adhere to the "fail securely" principle by implementing explicit runtime enforcement (e.g., throwing an error if the token equals the default) to prevent the application from successfully connecting or running with the publicly known default.
