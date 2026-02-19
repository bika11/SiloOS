---
description: Deploy local Industrial UI changes to the Raspberry Pi
---

// turbo-all
# SiloOS Deployment Workflow

Use this workflow to push the latest local changes (Industrial UI, protocol fixes, backend) to the active Raspberry Pi deployment.

### 1. Push Code to Remote
Synchronize the local code to the Raspberry Pi.
```powershell
# Sync the dashboard source and assets
scp -i siloos_key -r dashboard/src siloos@10.0.124.90:/home/siloos/dashboard/
scp -i siloos_key dashboard/index.html siloos@10.0.124.90:/home/siloos/dashboard/
# Sync the backend bridge
scp -i siloos_key ble_bridge.py siloos@10.0.124.90:/home/siloos/
```

### 2. Restart Services
Restart both the backend bridge and HMI dashboard services.
```powershell
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart silo-bridge; sudo systemctl restart silo-dashboard"
```

### 3. Verify Deployment
Check both service statuses.
```powershell
ssh -i siloos_key siloos@10.0.124.90 "systemctl status silo-bridge silo-dashboard --no-pager"
```
