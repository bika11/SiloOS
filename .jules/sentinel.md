## 2026-07-19 - Timing Attack on WebSocket Auth
**Vulnerability:** The WebSocket handler in ble_bridge.py compared the auth token using the regular string inequality operator (!=). This is susceptible to timing attacks, allowing an attacker to guess the token character by character based on response times.
**Learning:** Standard string comparison operators fail fast on the first mismatched character. For security tokens, a constant-time comparison is necessary.
**Prevention:** Always use secrets.compare_digest for comparing authentication tokens or passwords to ensure execution time does not depend on the inputs. Also, handle cases where the provided token might be None to prevent TypeErrors in compare_digest.
