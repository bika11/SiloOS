## 2026-08-08 - Externalize auth token
**Vulnerability:** Hardcoded websocket authentication token "silo-secret" found in frontend, backend config, and installation scripts.
**Learning:** Hardcoded credentials leak sensitive access controls to version control, making all instances trivially exploitable by default.
**Prevention:** Migrate to environment variables (`VITE_WS_AUTH_TOKEN`) and configuration files (`config.json`) with a clearly identifiable placeholder fallback (e.g. `"CHANGE_ME"`) out of the box to require manual setup of secure tokens.
