## 2026-07-08 - Hardcoded API Credentials in Frontend
**Vulnerability:** Hardcoded Cropster API credentials (client ID and secret) found in `dashboard/src/services/cropster.ts`.
**Learning:** Hardcoding credentials in frontend source code exposes them to anyone who accesses the application, leading to unauthorized access to external APIs.
**Prevention:** Always load sensitive credentials from environment variables (e.g., using `VITE_` prefix in Vite apps) or a secure runtime configuration, never committing them directly to source control.
