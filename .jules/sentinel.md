## 2026-08-21 - Externalized Authentication Tokens and Fail Securely
**Vulnerability:** Hardcoded authentication token `silo-secret` was used as a fallback across both client (dashboard) and server (ble_bridge.py).
**Learning:** Relying on default fallbacks for secrets without runtime validation allows systems to fail open and start in an insecure state. It is crucial to enforce "fail securely" by aborting execution if known default values are detected. Both client and server must agree on the same fallback value ("CHANGE_ME") to prevent breaking connections before enforcing the failure.
**Prevention:** Always use environment variables for secrets, provide an `.env.example` file, and implement startup checks to enforce that secrets have been explicitly configured.
