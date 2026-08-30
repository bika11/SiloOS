## 2026-07-23 - Prevent Timing Attacks in Authentication
**Vulnerability:** Timing attack vulnerability when comparing authentication tokens using `!=`.
**Learning:** Using standard string comparison operators (`==` or `!=`) for secrets allows attackers to measure response times to guess tokens character by character. `secrets.compare_digest` prevents this. Additionally, when input comes from request parameters, it can be `None`, which raises a `TypeError` in `compare_digest`.
**Prevention:** Always use `secrets.compare_digest` for secret comparisons and explicitly check if potentially `None` inputs are `None` before comparing to avoid runtime errors.
