## 2025-02-18 - [Preventing Timing Attacks in Token Comparisons]
**Vulnerability:** Found a non-constant time string comparison (`client_token != AUTH_TOKEN`) for checking websocket authentication tokens in Python.
**Learning:** Using simple equality operators for comparing sensitive authentication tokens makes the system vulnerable to timing attacks, which allows attackers to guess the token length and potentially its value character-by-character. Additionally, string comparisons can raise a `TypeError` if one of the operands is `None`.
**Prevention:** Use `secrets.compare_digest(a, b)` for all cryptographic and auth token comparisons in Python. Always check if the input token is `None` before passing it to `compare_digest`.
