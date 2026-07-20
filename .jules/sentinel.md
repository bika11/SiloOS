## 2026-07-20 - [Fix timing attack in auth token comparison]
**Vulnerability:** Used `!=` for comparing API authentication tokens, making it vulnerable to timing attacks.
**Learning:** Python's standard string comparison returns early on mismatched characters, which can leak information about the expected token length and content.
**Prevention:** Always use `secrets.compare_digest()` for comparing secure tokens, and handle potential `None` values explicitly before comparison.
