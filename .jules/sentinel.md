## 2026-02-18 - Hardcoded Auth Token Vulnerability
**Vulnerability:** A hardcoded WebSocket authentication token ("silo-secret") was present in the frontend, backend, and setup script.
**Learning:** Hardcoding credentials makes systems vulnerable out of the box and prevents secure deployment. In a mixed architecture (React + Python), coordination is required to securely provision both sides without exposing the secret.
**Prevention:** Always use environment variables for frontend configuration and dynamically generate secure default configuration files during initialization scripts (e.g. `setup.sh`) with tools like `openssl rand -hex 16`. Ensure generated secrets are pushed to both backend (`config.json`) and frontend (`.env`).
