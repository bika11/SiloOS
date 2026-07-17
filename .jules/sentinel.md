## 2024-05-01 - Auth Token Timing Attack
**Vulnerability:** The authentication check in `ble_bridge.py` (`websocket_handler`) used a simple `!=` string comparison to validate the auth token query parameter, making it vulnerable to a timing attack where an attacker could deduce the auth token character by character.
**Learning:** Python's standard string comparison operators short-circuit, causing execution time to vary depending on how many characters match the secret, exposing information about the length and contents of the secret.
**Prevention:** Use `secrets.compare_digest(a, b)` for all security-sensitive string/token comparisons. Always ensure to handle cases where an expected token might be missing or `None` before comparing to avoid `TypeError`.
