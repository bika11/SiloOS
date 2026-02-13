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
ssh -i siloos_key siloos@10.0.124.90 "cp /home/siloos/ble_bridge.py /home/siloos/ble_bridge.py.backup"
```

### 2. Deploy Python Bridge
```bash
scp -i siloos_key ble_bridge.py siloos@10.0.124.90:/home/siloos/ble_bridge.py
scp -i siloos_key config.json siloos@10.0.124.90:/home/siloos/config.json
```

### 3. Deploy Dashboard (if changed)
```bash
cd dashboard && npm run build
scp -i siloos_key -r dashboard/dist/* siloos@10.0.124.90:/home/siloos/dashboard-dist/
```

### 4. Restart Services
```bash
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart scale_bridge"
```

### 5. Verify Deployment
```bash
# Check service is running
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl status scale_bridge"

# Check recent logs for errors
ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -n 30 --no-pager"

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
ssh -i siloos_key siloos@10.0.124.90 "cp /home/siloos/ble_bridge.py.backup /home/siloos/ble_bridge.py && sudo systemctl restart scale_bridge"
```

### 8. Update Status
- Update `STATUS.md` with deployment date and what changed
- Verify all component statuses are current
