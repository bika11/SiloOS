## 2026-02-19 - Removed Hardcoded WebSocket Token
**Vulnerability:** Hardcoded API token "silo-secret" used as fallback for WebSocket auth.
**Learning:** Hardcoded fallbacks undermine environment variable configuration and leave systems exposed in production if env vars fail to load.
**Prevention:** Never use hardcoded strings as fallbacks for authentication secrets; prefer failing securely.
