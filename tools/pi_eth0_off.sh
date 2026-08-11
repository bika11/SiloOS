#!/usr/bin/env bash
# eth0 on this Pi is a dead link (100% loss to gateway) but is the PREFERRED
# IPv4 route, black-holing all IPv4. Take it down so Wi-Fi (wlan0, healthy) is
# the sole path. Persistent (autoconnect off). 5-min safety re-ups eth0 if we
# lose the box. Run detached on the Pi.
set -uo pipefail
LOG=/home/siloos/pi_eth0_off.log
exec > >(tee "$LOG") 2>&1
echo "===== eth0 off ====="
# Safety net: restore eth0 in 5 minutes no matter what.
systemctl reset-failed eth0-safety 2>/dev/null || true
systemd-run --on-active=300 --unit=eth0-safety --collect /sbin/ip link set eth0 up >/dev/null 2>&1 || true
echo "safety timer armed (eth0 auto-restores in 5 min if not cancelled)"

ETHCON="$(nmcli -t -f NAME,DEVICE connection show 2>/dev/null | awk -F: '$2=="eth0"{print $1; exit}')"
if [ -n "${ETHCON:-}" ]; then
  nmcli connection modify "$ETHCON" connection.autoconnect no 2>&1 || true
  nmcli connection down "$ETHCON" 2>&1 || true
  echo "nmcli: downed eth0 connection '$ETHCON' + autoconnect off (persistent)"
else
  ip link set eth0 down && echo "eth0 downed via ip link (non-persistent)"
fi
sleep 3
echo "--- routes now (expect wlan0 only) ---"; ip route
echo "--- wlan0 gateway reachability ---"; ping -c3 -I wlan0 10.0.124.1 2>&1 | tail -2
echo "--- listening (dashboard 5173 + bridge 8765) ---"; ss -tln | grep -E ":5173|:8765" || echo none
echo "ETH0_OFF_DONE"
