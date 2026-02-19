---
name: siloos-ops
description: "Handles build, test, lint, and deployment operations for the SiloOS project."
---

# SiloOS Operations Skill

## Commands

### Build Dashboard
- **Command**: `cd dashboard && npm run build`
- **Purpose**: Compile TypeScript and build the Vite production bundle.

### Lint Dashboard
- **Command**: `cd dashboard && npm run lint`
- **Purpose**: Check for code style and logic errors in the frontend.

### Sync to Raspberry Pi
- **Command**: `./sync-project.ps1`
- **Purpose**: Synchronize local changes to the Raspberry Pi and restart services.

### Manual Code Deployment (Pi)
1. **Copy Bridge**: `scp -i siloos_key ble_bridge.py siloos@10.0.124.90:/home/siloos/ble_bridge.py`
2. **Copy Config**: `scp -i siloos_key config.json siloos@10.0.124.90:/home/siloos/config.json`
3. **Restart Service**: `ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart scale_bridge"`
4. **Verify Logs**: `ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -n 20 --no-pager"`

### Run Dashboard (Dev)
- **Command**: `cd dashboard && npm run dev -- --host`
- **Purpose**: Start the development server with external access enabled.

### Run Python Bridge (Local Debug)
- **Command**: `python3 ble_bridge.py`
- **Purpose**: Start the hardware bridge for local testing (requires BLE hardware).

## Deployment Procedure
1. Build local assets: `npm run build`
2. Sync to Pi using `sync-project.ps1` or manual `scp`.
3. Verify service status: `sudo systemctl status scale_bridge`.
