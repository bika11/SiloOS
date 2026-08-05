## 2026-08-05 - Fix hardcoded token and timing attack vulnerability
**Vulnerability:** A hardcoded WebSocket authentication token ('silo-secret') was present across multiple files, and the token comparison in Python was vulnerable to timing attacks via standard string inequality.
**Learning:** Hardcoded secrets break deployment isolation and security. Naive string comparison of secrets allows attackers to guess tokens byte-by-byte by measuring response times.
**Prevention:** Always use dynamically generated secrets injected via environment variables or secure configurations. Always use `secrets.compare_digest` for cryptographic or secret comparisons in Python.
