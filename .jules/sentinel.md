## 2026-02-19 - Hardcoded Default Authentication Secrets
**Vulnerability:** Found hardcoded `silo-secret` default auth token and Cropster API keys within frontend and backend code files, posing a severe access control risk.
**Learning:** Default configuration setups often prioritize "easy" setup by hardcoding standard secrets across backend scripts (`setup.sh`, `ble_bridge.py`) and frontend environments (`SiloManager.ts`), which completely bypasses authentication if users do not manually change them.
**Prevention:** Avoid default fallback tokens. Use dynamic provisioning (`openssl rand`) in setup scripts to enforce unique tokens per environment immediately on generation.
