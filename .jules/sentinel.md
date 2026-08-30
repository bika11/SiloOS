## 2026-07-27 - Prevent Timing Attacks in Token Verification
**Vulnerability:** The `ble_bridge.py` WebSocket handler compared the client auth token against the configured `AUTH_TOKEN` using a simple string equality check (`client_token != AUTH_TOKEN`).
**Learning:** Simple string comparison can expose the system to timing attacks, as the comparison operator returns early upon the first mismatched character. An attacker could potentially infer the secret token by measuring response times.
**Prevention:** Always use `secrets.compare_digest()` for comparing sensitive strings like authentication tokens or passwords. Ensure potential `None` values (like missing query parameters) are handled before comparison to prevent `TypeError`.
