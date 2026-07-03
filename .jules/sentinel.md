## 2026-02-19 - Removed Hardcoded Authentication Token
**Vulnerability:** Hardcoded WebSocket authentication token (`silo-secret`) in `dashboard/src/bluetooth/SiloManager.ts`.
**Learning:** Hardcoding credentials directly into source code, even as fallback values, exposes the system if the repository becomes public or is breached.
**Prevention:** Always source credentials from environment variables (e.g. `import.meta.env.VITE_...`) and provide an `.env.example` file so developers know what to configure without risking checking in the actual secrets.
