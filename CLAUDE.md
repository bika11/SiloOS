# SiloOS - Claude Code Project Configuration

## Project Overview
SiloOS is a BLE gateway system connecting a Scanomat TopBrewer coffee machine to a Laumas TLS485 scale via Raspberry Pi 3B+, with a React PWA dashboard.

## Architecture
- **Backend**: Python 3 async (aiohttp/bleak) on Raspberry Pi
- **Frontend**: React 19 + TypeScript 5.9 + Vite 7.2 in `dashboard/`
- **Protocol**: SFWU binary protocol with CRC32-CCITT checksums
- **Communication**: WebSocket relay (ws://10.0.124.90:8765) + BLE GATT + RS485 serial

## Key Paths
- `ble_bridge.py` — Main Python bridge (runs on Pi)
- `config.json` — Runtime configuration (MAC, port, auth token)
- `dashboard/src/` — React PWA source
- `dashboard/src/bluetooth/` — BLE communication layer
- `dashboard/src/sfwu/` — SFWU protocol implementation
- `dashboard/src/features/` — UI screens/components
- `.agent/` — Multi-agent collaboration system

## Rules
- NEVER modify `siloos_key` or `siloos_key.pub`
- ALWAYS run TypeScript strict mode checks after frontend changes
- When modifying `ble_bridge.py`, trigger the sync-project workflow
- When modifying SFWU parsers, update ONLY `src/sfwu/parsers/` (NOT `src/sfwu/responses/`)
- Keep the WebSocket API contract stable — changes require updating both Python bridge and TypeScript client
- Pin all new Python dependencies in `requirements.txt`
- Use `.env` files for secrets, never hardcode tokens

## Agent System
This project uses a multi-agent collaboration framework in `.agent/`.
- Read `.agent/ORCHESTRATOR.md` for the full system overview
- Read `.agent/STATUS.md` for current project status
- Read `.agent/TASKS.md` for the prioritized task board
- Skills are in `.agent/skills/`, workflows in `.agent/workflows/`

## Commands
```bash
# Dashboard dev server
cd dashboard && npm run dev -- --host

# Build dashboard
cd dashboard && npm run build

# Lint
cd dashboard && npm run lint

# Pi bridge (on Raspberry Pi)
python3 ble_bridge.py

# Sync to Pi
scp -i ./siloos_key ./ble_bridge.py siloos@10.0.124.90:/home/siloos/ble_bridge.py
ssh -i ./siloos_key siloos@10.0.124.90 "sudo systemctl restart scale_bridge"
```
