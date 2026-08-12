#!/usr/bin/env bash
#
# pi_full_fix.sh — One-shot, idempotent setup to make SiloOS reliably serve the
# dashboard + bridge over Wi-Fi to multiple devices. Run as root ON THE PI,
# detached (survives SSH drops):
#   sudo systemd-run --unit=silo-fix --collect bash /home/siloos/pi_full_fix.sh
# Then poll /home/siloos/pi_fix.log for FIX_COMPLETE_MARKER.
#
set -uo pipefail   # not -e: keep going past non-fatal steps
LOG=/home/siloos/pi_fix.log
exec > >(tee "$LOG") 2>&1
echo "===== SiloOS Pi full fix started ====="

IW="$(command -v iw || echo /usr/sbin/iw)"
NPM="$(command -v npm || echo /usr/bin/npm)"
NODE="$(command -v node || echo /usr/bin/node)"
NODEDIR="$(dirname "$NODE")"
DASH=/home/siloos/dashboard
echo "iw=$IW npm=$NPM node=$NODE dash=$DASH"

echo "--- [1] Wi-Fi power save OFF (runtime) ---"
"$IW" dev wlan0 set power_save off && echo "  runtime power_save off OK" || echo "  runtime set failed"
"$IW" dev wlan0 get power_save 2>&1 || true

echo "--- [2] Persist power-save-off across reboots ---"
cat >/etc/systemd/system/wifi-powersave-off.service <<UNIT
[Unit]
Description=Disable wlan0 Wi-Fi power saving (SiloOS reliability)
After=network.target
[Service]
Type=oneshot
ExecStart=$IW dev wlan0 set power_save off
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
# Also tell NetworkManager to keep power save off if it manages wlan0.
if command -v nmcli >/dev/null 2>&1; then
  WCON="$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: '$2=="wlan0"{print $1; exit}')"
  [ -n "${WCON:-}" ] && nmcli connection modify "$WCON" 802-11-wireless.powersave 2 && echo "  nmcli powersave disabled on '$WCON'"
fi
systemctl daemon-reload
systemctl enable --now wifi-powersave-off.service && echo "  powersave-off service enabled"

echo "--- [2b] Fix ARP flux from dual-homing (eth0 + wlan0 on same /24) ---"
# Two interfaces on one subnet makes each answer ARP for the other's IP,
# causing intermittent reachability. These make each iface own only its IP.
cat >/etc/sysctl.d/99-siloos-arp.conf <<SYSCTL
net.ipv4.conf.all.arp_ignore=1
net.ipv4.conf.all.arp_announce=2
net.ipv4.conf.default.arp_ignore=1
net.ipv4.conf.default.arp_announce=2
SYSCTL
sysctl -p /etc/sysctl.d/99-siloos-arp.conf 2>&1 || true
echo "  ARP flux sysctls applied"

echo "--- [3] Bridge service (scale_bridge) ---"
systemctl enable scale_bridge 2>&1 || true
# Guarded restart: never sever the control loop while a dose is dispensing (the
# hopper would overflow). Prefer the shared guard script; fall back to an inline
# check so this recovery tool still works if pushed on its own.
GUARD="$(dirname "$0")/restart_bridge_safe.sh"
[ -f "$GUARD" ] || GUARD="/home/siloos/tools/restart_bridge_safe.sh"
if [ -f "$GUARD" ]; then
  bash "$GUARD" --wait 30 || echo "  WARNING: bridge NOT restarted (dose active?) — re-run when idle"
else
  # Inline fallback: skip the restart if the newest dose event is armed/running.
  _LAST=$(grep -E '"event": "pi_dose_(armed|running|complete)"|"event": "pi_force_abort"' /home/siloos/logs/dispensing.log 2>/dev/null | tail -1)
  if echo "$_LAST" | grep -qE '"event": "pi_dose_(armed|running)"'; then
    echo "  WARNING: a dose looks ACTIVE — skipping scale_bridge restart. Re-run when idle."
  else
    systemctl restart scale_bridge 2>&1 || true
  fi
fi
sleep 2
echo "  scale_bridge active=$(systemctl is-active scale_bridge) enabled=$(systemctl is-enabled scale_bridge)"

echo "--- [4] Dashboard dependencies ---"
if [ ! -d "$DASH" ]; then
  echo "  !! $DASH does not exist — cannot serve dashboard"
else
  if [ ! -d "$DASH/node_modules" ]; then
    echo "  node_modules missing — running npm install as siloos (may take several minutes)..."
    sudo -u siloos bash -lc "cd '$DASH' && '$NPM' install" && echo "  npm install done" || echo "  npm install FAILED"
  else
    echo "  node_modules present — skipping install"
  fi
fi

echo "--- [5] Dashboard service (Vite dev server, all interfaces, port 5173) ---"
cat >/etc/systemd/system/silo-dashboard.service <<UNIT
[Unit]
Description=SiloOS Dashboard (Vite, all interfaces)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0
[Service]
Type=simple
User=siloos
WorkingDirectory=$DASH
Environment=PATH=$NODEDIR:/usr/local/bin:/usr/bin:/bin
# --host (no value) binds dual-stack IPv4 + IPv6. Do NOT use 0.0.0.0 here:
# siloos.local resolves to an IPv6 address, so IPv4-only misses mDNS clients.
ExecStart=$NPM run dev -- --host --port 5173
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable silo-dashboard.service 2>&1 || true
systemctl restart silo-dashboard.service 2>&1 || true
echo "  waiting for dashboard to bind..."
for n in $(seq 1 30); do
  if ss -tln | grep -q ":5173"; then break; fi
  sleep 2
done
echo "  silo-dashboard active=$(systemctl is-active silo-dashboard)"

echo "--- [6] Final listening sockets ---"
ss -tln | grep -E ":5173|:8765" || echo "  !! Neither 5173 nor 8765 listening"

echo "--- [7] Interfaces ---"
ip -4 -o addr show | grep -v " lo "

echo "===== SiloOS Pi full fix finished ====="
echo "FIX_COMPLETE_MARKER"
