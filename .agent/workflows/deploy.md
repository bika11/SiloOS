# Workflow: Production Deployment

## Trigger
When deploying changes to the live Raspberry Pi system.

## Pre-Deployment Checklist
- [ ] All tasks for this release are `done` in `TASKS.md`
- [ ] `npm run build` passes with zero errors
- [ ] `npm run lint` passes with zero warnings
- [ ] Code review completed (skill: `code-review`)
- [ ] No new security issues

## Steps

### 1. Backup Current State
```bash
ssh -i siloos_key siloos@siloos.local "cp /home/siloos/ble_bridge.py /home/siloos/ble_bridge.py.backup"
```

### 2. Deploy Python Bridge
```bash
scp -i siloos_key ble_bridge.py siloos@siloos.local:/home/siloos/ble_bridge.py
scp -i siloos_key config.json siloos@siloos.local:/home/siloos/config.json
```

### 3. Deploy Dashboard (if changed)
```bash
cd dashboard && npm run build
scp -i siloos_key -r dashboard/dist/* siloos@siloos.local:/home/siloos/dashboard-dist/
```

### 4. Restart Services
⚠️ **Never `systemctl restart scale_bridge` directly.** Restarting mid-dose severs the
gravimetric control loop and the hopper overflows. Use the **guarded restart**, which refuses while
a dose is armed/running (deploy the guard once: `scp -i siloos_key tools/restart_bridge_safe.sh
siloos@siloos.local:/home/siloos/tools/`):
```bash
# --wait 60: if a dose is live, poll up to 60s for it to finish, then restart.
ssh -i siloos_key siloos@siloos.local "sudo bash /home/siloos/tools/restart_bridge_safe.sh --wait 60"
# check only (no restart): ... "bash /home/siloos/tools/restart_bridge_safe.sh --check"  # 0 idle / 3 active
```

### 5. Verify Deployment
```bash
# Check service is running
ssh -i siloos_key siloos@siloos.local "sudo systemctl status scale_bridge"

# Check recent logs for errors
ssh -i siloos_key siloos@siloos.local "sudo journalctl -u scale_bridge -n 30 --no-pager"

# Verify BLE connection
# Look for "BLE connected" in logs
```

### 6. Smoke Test
- Open dashboard in browser
- Verify connection indicator shows "Connected"
- Verify menu loads
- Verify scale reading appears
- Place a test order (if safe to do so)

### 7. Rollback (if needed)
```bash
ssh -i siloos_key siloos@siloos.local "cp /home/siloos/ble_bridge.py.backup /home/siloos/ble_bridge.py && sudo systemctl restart scale_bridge"
```

### 8. Update Status
- Update `STATUS.md` with deployment date and what changed
- Verify all component statuses are current
