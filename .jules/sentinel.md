## 2026-07-22 - Timing Attack in Auth Token Validation
**Vulnerability:** Comparing authentication tokens using standard string comparison (`!=`), which can leak information about the correct token via timing attacks.
**Learning:** Standard string comparison operators fail early upon finding a mismatch, meaning the time taken to check a string is proportional to the number of matching characters. An attacker could exploit this to guess the token one character at a time.
**Prevention:** Always use a constant-time comparison function, such as `secrets.compare_digest()` in Python, for comparing secrets like auth tokens. Also, always ensure the token to compare against is not None.
