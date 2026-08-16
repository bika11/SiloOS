## 2026-02-19 - Removed Hardcoded Secret Token
**Vulnerability:** A hardcoded `silo-secret` was being used as the default fallback for authentication across both the backend (`ble_bridge.py`) and frontend (`dashboard/src/bluetooth/SiloManager.ts`), which is a major security risk for public repositories and production systems.
**Learning:** Hardcoded authentication tokens are common in development and can easily slip into production if fallback mechanisms depend on them instead of explicitly defined environment variables.
**Prevention:** Avoid hardcoded secrets in source code by throwing errors when required configuration values are missing, or by forcing default placeholders (like `"CHANGE_ME"`) that are rejected during authentication checks unless properly updated.
