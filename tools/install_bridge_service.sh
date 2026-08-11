#!/usr/bin/env bash
#
# install_bridge_service.sh — Install & enable the SiloOS bridge as an
# auto-restarting systemd service on the Pi. Idempotent; safe to re-run.
#
# Root cause it fixes: the current Pi 4 has NO `scale_bridge` service, so the
# bridge never starts on boot. This creates it with Restart=always so a crash
# or reboot brings it back automatically.
#
# Usage (ON THE PI):   bash install_bridge_service.sh
# Or from the laptop:  scp -i siloos_key tools/scale_bridge.service tools/install_bridge_service.sh siloos@siloos.local:/home/siloos/
#                      ssh -i siloos_key siloos@siloos.local "bash /home/siloos/install_bridge_service.sh"
#
set -euo pipefail

UNIT_NAME="scale_bridge.service"
UNIT_DST="/etc/systemd/system/${UNIT_NAME}"
BRIDGE="/home/siloos/ble_bridge.py"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Pre-flight checks"
if [[ ! -f "$BRIDGE" ]]; then
  echo "!! $BRIDGE not found. Copy ble_bridge.py to /home/siloos first." >&2
  exit 1
fi
python3 -c "import bleak, aiohttp, serial" 2>/dev/null \
  && echo "    Python deps present (bleak/aiohttp/pyserial)." \
  || echo "    WARNING: Python deps missing — install with: pip3 install -r /home/siloos/requirements.txt"

echo "==> Installing unit -> $UNIT_DST"
if [[ -f "${SRC_DIR}/scale_bridge.service" ]]; then
  sudo cp "${SRC_DIR}/scale_bridge.service" "$UNIT_DST"
else
  # Fallback: write the unit inline if the file wasn't copied alongside.
  sudo tee "$UNIT_DST" >/dev/null <<'UNIT'
[Unit]
Description=SiloOS BLE/RS485 Bridge (TopBrewer <-> Laumas scale <-> dashboard)
After=network-online.target bluetooth.target
Wants=network-online.target

[Service]
Type=simple
User=siloos
WorkingDirectory=/home/siloos
ExecStart=/usr/bin/python3 /home/siloos/ble_bridge.py
Restart=always
RestartSec=3
StartLimitIntervalSec=0
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
fi

echo "==> Enabling + starting service"
sudo systemctl daemon-reload
sudo systemctl enable "$UNIT_NAME"
sudo systemctl restart "$UNIT_NAME"
sleep 2

echo "==> Status"
systemctl is-enabled "$UNIT_NAME" || true
systemctl is-active  "$UNIT_NAME" || true
echo "==> Is the bridge listening on 8765?"
ss -tlnp 2>/dev/null | grep -q ":8765" && echo "    YES — 8765 is listening." || echo "    NO — check: sudo journalctl -u $UNIT_NAME -n 40 --no-pager"
