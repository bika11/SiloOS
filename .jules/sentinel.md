## 2026-08-06 - Hardcoded Secret in Auth Check
**Vulnerability:** A hardcoded token `silo-secret` was being used in both the backend bridge and the frontend application for authenticating the WebSocket connection.
**Learning:** Hardcoded tokens commit sensitive auth material directly to the source control, undermining the security if the repo is ever cloned or shared.
**Prevention:** Rely on environment variables and ensure secrets are securely loaded at runtime. Do not leave hardcoded fallback secrets in application code.
