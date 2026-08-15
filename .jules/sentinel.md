## 2026-08-15 - Fix Hardcoded Auth Token
**Vulnerability:** Hardcoded secret 'silo-secret' was used as the default auth token across client and server.
**Learning:** Hardcoding default credentials, even for dev environments, can lead to production systems using insecure defaults if configuration isn't updated.
**Prevention:** Migrate hardcoded secrets to environment variables or config files with safe default placeholder values like 'CHANGE_ME', forcing users to rotate them.
