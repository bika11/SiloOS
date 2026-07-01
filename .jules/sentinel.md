## 2026-02-19 - Removed Hardcoded Auth Token
**Vulnerability:** A hardcoded `silo-secret` was used as the default fallback auth token across Python configuration, frontend connections, and the tracked `config.json`.
**Learning:** Default configuration files should never include hardcoded credentials; tracked configurations should be examples.
**Prevention:** Rename tracked configuration containing sensitive fields to `config.example.json` and generate secure random credentials during setup using `/dev/urandom`. Add `config.json` to `.gitignore`.
