## 2026-08-12 - Hardcoded Secret in Fallback Configs
**Vulnerability:** A hardcoded authentication token ("silo-secret") was embedded in default configuration templates and frontend application fallbacks.
**Learning:** Even default fallback values for local configurations can pose a risk if exposed to untrusted networks or if users fail to update them before production.
**Prevention:** Always use environment variables for secrets, and set fallback placeholders to clear, generic values like "CHANGE_ME" that uniformly prompt user configuration without acting as valid implicit credentials.
