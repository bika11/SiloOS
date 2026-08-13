#!/usr/bin/env bash
# install_healthlog.sh — install & enable the SiloOS health-log timer + logrotate.
# Idempotent. Run ON THE PI after scp'ing tools/ across. Does NOT touch scale_bridge.
#
#   sudo bash /home/siloos/tools/install_healthlog.sh
set -uo pipefail

SRC="${SRC:-/home/siloos/tools/systemd}"
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

echo "[install_healthlog] installing units from $SRC"
$SUDO install -m 0644 "$SRC/pi-healthlog.service" /etc/systemd/system/pi-healthlog.service
$SUDO install -m 0644 "$SRC/pi-healthlog.timer"   /etc/systemd/system/pi-healthlog.timer
$SUDO install -m 0644 "$SRC/siloos.logrotate"     /etc/logrotate.d/siloos

# logrotate refuses world-writable/foreign-owned dirs; validate config parses.
if $SUDO logrotate -d /etc/logrotate.d/siloos >/dev/null 2>&1; then
  echo "[install_healthlog] logrotate config OK"
else
  echo "[install_healthlog] WARN: logrotate -d reported issues (see: sudo logrotate -d /etc/logrotate.d/siloos)" >&2
fi

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now pi-healthlog.timer

echo "[install_healthlog] timer status:"
$SUDO systemctl status pi-healthlog.timer --no-pager -n 3 2>&1 | head -6 || true
echo "[install_healthlog] firing one sample now ..."
$SUDO systemctl start pi-healthlog.service
sleep 1
echo "[install_healthlog] latest health.log line:"
tail -n 1 /home/siloos/health.log 2>/dev/null || echo "(health.log not written yet)"
echo "[install_healthlog] DONE"
