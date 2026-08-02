## 2026-08-02 - Timing Attack in Auth Token Comparison
**Vulnerability:** Auth tokens were compared using the `!=` operator, making the system susceptible to timing attacks.
**Learning:** Basic string comparison operators fail fast when characters don't match, exposing timing information.
**Prevention:** Always use `secrets.compare_digest` (or equivalent constant-time comparison functions) when checking sensitive tokens or passwords, and verify inputs are not `None` before comparison to prevent `TypeError`.
