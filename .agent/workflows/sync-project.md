---
description: Sync local repository with remote Pi and update documentation
---

// turbo-all
# SiloOS Project Sync Workflow

Use this workflow to ensure the local master copy, documentation, and automated installer are always updated based on the latest deployment.

### 1. Synchronize Remote Code
Pull the latest operational files from the active deployment to ensure the local master matches the live system.
```powershell
ssh -i siloos_key -o BatchMode=yes -o StrictHostKeyChecking=no siloos@10.0.124.90 "cat /home/siloos/ble_bridge.py" > ble_bridge.py
ssh -i siloos_key -o BatchMode=yes -o StrictHostKeyChecking=no siloos@10.0.124.90 "cat /etc/systemd/system/scale_bridge.service" > scale_bridge.service
```

### 2. Update Documents
If `ble_bridge.py` logic changed (e.g., new ports, new dependency), update the following files:
- **README.md**: Update port numbers, service names, or connection strings.
- **HARDWARE.md**: Update wiring if the RS-485 mapping changed.
- **setup.sh**: Add any new `pip install` or `apt get` commands added during debugging.

### 3. Verification
Run a quick check on the local directory to ensure no files were corrupted during the sync.
```powershell
dir ble_bridge.py, scale_bridge.service, setup.sh, README.md, HARDWARE.md
```

### 4. Commit Changes
Ensure all updates are committed to version control.
```powershell
git add .
git commit -m "Sync project files and documentation with live deployment"
```
