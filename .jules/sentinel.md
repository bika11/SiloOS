## 2024-05-24 - Prevent timing attacks in token comparison
**Vulnerability:** Direct string comparison (e.g. `client_token != AUTH_TOKEN`) was used to verify auth tokens, allowing for timing attacks.
**Learning:** Direct string comparisons fail early, revealing information about the correct token length and characters based on response time.
**Prevention:** Use `secrets.compare_digest()` (and check for null before comparison) to perform constant-time comparisons when validating authentication tokens or secrets.
