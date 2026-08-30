## 2026-07-15 - Timing Attack in Token Comparison
**Vulnerability:** Standard string equality (`!=`) used for auth token comparison in `ble_bridge.py`.
**Learning:** Python's string comparison exits early on first mismatch, leaking token length and character correctness via timing differences. Null checks are also required before `secrets.compare_digest` to prevent `TypeError`.
**Prevention:** Always use `secrets.compare_digest()` for tokens, keys, and passwords. Ensure inputs are string-like and not `None` before comparing.
