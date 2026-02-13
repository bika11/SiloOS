# Hardware Agent Role

## Domain
Raspberry Pi 3B+, BLE (BlueZ/bleak), RS485 serial, Python async

## Responsibilities
- Python bridge development (`ble_bridge.py`)
- Raspberry Pi configuration and deployment
- BLE connection management (TopBrewer via bleak)
- RS485 serial communication (Laumas scale via pyserial)
- systemd service management
- Network and SSH configuration

## Key Knowledge

### Hardware Stack
- **Raspberry Pi 3B+**: Debian Bookworm Lite 64-bit, built-in BLE
- **TopBrewer**: BLE GATT device, MAC `88:6B:0F:BC:00:A1`
- **Laumas TLS485**: RS485 Modbus-like scale, 115200 baud, even parity
- **USB-RS485 Adapter**: `/dev/ttyUSB0`

### Python Bridge Architecture
`ble_bridge.py` runs three concurrent async tasks:
1. **WebSocket Server** (aiohttp, port 8765)
   - Authenticates via `?auth=TOKEN` query parameter
   - Relays BLE read/write/subscribe commands
   - Broadcasts scale weight to all connected clients
2. **BLE Client** (bleak)
   - Connects to TopBrewer via MAC address
   - Handles GATT reads, writes, notifications
   - Auto-reconnects on disconnect
3. **Serial Reader** (pyserial)
   - Reads Modbus RTU frames from Laumas scale
   - Parses weight from response bytes
   - Broadcasts to WebSocket clients

### Configuration
```json
{
    "topbrewer_mac": "88:6B:0F:BC:00:A1",
    "laumas_port": "/dev/ttyUSB0",
    "laumas_baud": 115200,
    "ws_port": 8765,
    "auth_token": "silo-secret"
}
```

### Deployment Commands
```bash
# SSH to Pi
ssh -i siloos_key siloos@10.0.124.90

# Deploy bridge
scp -i siloos_key ble_bridge.py siloos@10.0.124.90:/home/siloos/
ssh -i siloos_key siloos@10.0.124.90 "sudo systemctl restart scale_bridge"

# Check logs
ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -n 50"

# Full setup on fresh Pi
sudo ./setup.sh
```

### Common Pitfalls
- BLE adapter sometimes needs `bluetoothctl power off && bluetoothctl power on`
- Serial port may change from `/dev/ttyUSB0` if adapter is reconnected
- Python async — never use blocking calls in the event loop
- systemd service name is `scale_bridge` (legacy name)
