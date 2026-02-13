# SiloOS Project Rules

> These rules apply to ALL agents working on SiloOS. Violations must be flagged in STATUS.md.

## Synchronization
- Whenever `ble_bridge.py`, `HARDWARE.md`, or `setup.sh` are modified, you MUST trigger the `sync-project` workflow to ensure local/remote alignment.
- After syncing, always verify the live system: `sudo journalctl -u scale_bridge.service -n 20`

## Documentation
- Any change to serial communication logic or BLE packet structure MUST be reflected in `README.md` and `HARDWARE.md` immediately.
- All completed tasks must update `STATUS.md` and mark tasks done in `TASKS.md`.

## Code Quality
- TypeScript strict mode is mandatory — no `any` types, no implicit returns.
- SFWU parsers live in `src/sfwu/parsers/` ONLY — never use or modify `src/sfwu/responses/`.
- Use `logger.ts` for all diagnostic output — never use `console.log` in production code.
- No hardcoded IPs, tokens, or ports in source code — use config files or environment variables.

## Security
- NEVER commit secrets (tokens, keys, passwords) to the repository.
- SSH keys (`siloos_key*`) must be in `.gitignore`.
- Auth tokens must come from environment variables or `config.json`.

## Dependencies
- Ensure `setup.sh` is updated if new Python libraries are introduced.
- Pin all Python dependency versions in `requirements.txt`.
- Pin npm dependencies via `package-lock.json` (auto-managed).

## Agent Collaboration
- Before editing a file, check `TASKS.md` to see if another agent has claimed it.
- Cross-domain changes (WebSocket API, protocol) require updating BOTH Python and TypeScript sides.
- Always read `ORCHESTRATOR.md` before starting work on the project.

## Permissions
- Agents are allowed to auto-run non-destructive Raspberry Pi commands (e.g., `ssh` status checks, `systemctl` restarts, `journalctl` logs) without explicit approval.
- Destructive operations (data deletion, service removal, key rotation) require user confirmation.

## Reference Implementation
- The original working Android app and PWA are at: `C:\Users\anbdk\OneDrive - scanomat.dk\Desktop\AmokkaTB`
- Use this as the authoritative reference for protocol behavior and command sequences.
