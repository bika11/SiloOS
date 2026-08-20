## 2026-08-20 - Hardcoded Credentials and Secure Defaults
**Vulnerability:** The application used a hardcoded default auth token ('silo-secret') across the client and server.
**Learning:** When migrating default credentials to environment variables in a client-server architecture, it's critical to ensure the fallback placeholder matches across systems to maintain initial setup flow, but more importantly, to "fail securely" by strictly enforcing that the default placeholder cannot actually connect or run the application.
**Prevention:** Always use explicit runtime checks that throw errors or crash the application if default/placeholder credentials (like 'CHANGE_ME') are actively used in production paths.
