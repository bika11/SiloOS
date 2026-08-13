## 2026-08-13 - Hardcoded Client-Server Auth Token Default
**Vulnerability:** A hardcoded authentication token ('silo-secret') was used as a fallback in both the frontend (SiloManager.ts) and backend (ble_bridge.py) to authenticate WebSocket connections, bypassing actual security out-of-the-box.
**Learning:** When client-server architectures require initial fallback configurations for development, using real-looking secrets like 'silo-secret' often leads to them being deployed in production unchanged.
**Prevention:** Use an explicit, non-working placeholder like 'CHANGE_ME' across all components. This ensures local setups remain aligned but forces administrators to intentionally configure secure environment variables (e.g. VITE_WS_AUTH_TOKEN) for production use.
