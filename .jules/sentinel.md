## 2024-05-24 - Timing attack vulnerability in auth token comparison
**Vulnerability:** Auth token comparison used a simple `!=` which is vulnerable to timing attacks.
**Learning:** Using basic string comparison for auth tokens exposes the system to timing side-channels, allowing an attacker to deduce the token character by character.
**Prevention:** Always use constant-time string comparison functions like `secrets.compare_digest` for security tokens and verify inputs aren't None before passing them.
