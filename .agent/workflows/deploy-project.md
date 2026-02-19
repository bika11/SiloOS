---
description: Deploy local Industrial UI changes to the Raspberry Pi
---

// turbo-all
# SiloOS Deployment Workflow

Use this workflow to push the latest local changes (Industrial UI, protocol fixes) to the active Raspberry Pi deployment.

### 1. Push Code to Remote
Synchronize the local code to the Raspberry Pi.
```powershell
# Sync the dashboard source and assets
scp -i siloos_key -r dashboard/src siloos@10.0.124.90:/home/siloos/dashboard/
scp -i siloos_key dashboard/index.html siloos@10.0.124.90:/home/siloos/dashboard/
```

### 2. Restart Services
Restart the HMI dashboard service to apply changes.
```powershell
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart silo-dashboard"
```

### 3. Verify Deployment
Check the service status and connectivity.
```powershell
ssh -i siloos_key siloos@10.0.124.90 "systemctl status silo-dashboard --no-pager"
```
