# Skill: Raspberry Pi Deployment

## When to Use
- Deploying updated Python bridge code to the Pi
- Setting up a fresh Raspberry Pi
- Restarting services after configuration changes
- Verifying the live system is healthy

## Prerequisites
- SSH key available at `./siloos_key`
- Pi reachable at `10.0.124.90` (or configured IP)
- Pi user: `siloos`

## Procedure

### Fresh Setup
```bash
# On the Pi (via SSH or local terminal):
git clone <repo_url> SiloOS
cd SiloOS
sudo ./setup.sh
# Edit config.json with correct MAC address
sudo systemctl start scale_bridge
```

### Code Deployment
```bash
# Step 1: Copy updated bridge
scp -i siloos_key ble_bridge.py siloos@10.0.124.90:/home/siloos/ble_bridge.py

# Step 2: Copy updated config (if changed)
scp -i siloos_key config.json siloos@10.0.124.90:/home/siloos/config.json

# Step 3: Restart service
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart scale_bridge"

# Step 4: Verify
ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -n 20 --no-pager"
```

### Health Check
```bash
# Service status
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl status scale_bridge"

# Recent logs
ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -n 50 --no-pager"

# System resources
ssh -i siloos_key siloos@10.0.124.90 "free -h && df -h / && uptime"

# BLE adapter
ssh -i siloos_key siloos@10.0.124.90 "bluetoothctl show"
```

### Dashboard Deployment (on Pi)
```bash
# Build locally
cd dashboard && npm run build

# Copy dist to Pi
scp -i siloos_key -r dashboard/dist siloos@10.0.124.90:/home/siloos/dashboard-dist/

# Serve with Python (simple)
ssh -i siloos_key siloos@10.0.124.90 "cd /home/siloos/dashboard-dist && python3 -m http.server 8080"
```

## Expected Outcomes
- Service restarts without errors
- Logs show successful BLE connection
- Scale readings appear in logs
- WebSocket server accepting connections

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SSH refused | Check Pi is on, verify IP, check `siloos_key` permissions |
| Service won't start | Check `journalctl` for Python errors |
| Permission denied | Ensure `ble_bridge.py` is readable, check systemd user |
| Port in use | `ssh ... "sudo lsof -i :8765"` to find conflicting process |
