## 2024-05-18 - Prevent Timing Attacks in Token Comparison
**Vulnerability:** The authentication token comparison `client_token != AUTH_TOKEN` was vulnerable to timing attacks.
**Learning:** Using standard string comparison operators (`!=` or `==`) for secrets allows attackers to measure the time it takes to compare strings, potentially guessing the token character by character.
**Prevention:** Always use `secrets.compare_digest(a, b)` for constant-time comparisons of secrets, ensuring that `None` values are explicitly handled first.
