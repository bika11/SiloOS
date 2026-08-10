## 2026-08-10 - Fix hardcoded auth token and exposed SSH key
**Vulnerability:** Hardcoded auth token (`silo-secret`) in multiple locations and SSH private key (`siloos_key`) tracked in git repo.
**Learning:** Default configuration and authentication secrets must not be hardcoded in application code, as they compromise initial deployments. Sensitive credentials like SSH keys must be untracked before sharing the codebase.
**Prevention:** Store default configuration in untracked `.env` files using `.env.example` for templating, read via environment variables in backend and frontend. Always add credential file patterns to `.gitignore` from project inception.
