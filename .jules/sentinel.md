## 2026-02-23 - Remove Hardcoded Secrets
**Vulnerability:** Found hardcoded auth token 'silo-secret' across python/TS services and hardcoded Cropster API credentials in TS.
**Learning:** Hardcoding credentials in source violates security practices. When mitigating, ensure fallback placeholders exactly match (e.g. 'CHANGE_ME') across client-server architecture so out-of-the-box local testing fails securely instead of connecting.
**Prevention:** Always use environment variables for sensitive auth configuration and provide a safe fallback or crash-early behavior.
