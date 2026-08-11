#!/usr/bin/env bash
#
# set_pi_static_ip.sh — Give the SiloOS Raspberry Pi a fixed static IP so it
# stops drifting on DHCP. Run this ON THE PI (via SSH once restored, or from a
# console/ethernet session).
#
# Target network (edit the CONFIG block if the LAN ever changes):
#   IP      : 10.0.124.5
#   Netmask : 255.255.255.0  (/24)
#   Gateway : 10.0.124.1
#
# Handles BOTH network stacks used across Raspberry Pi OS releases:
#   - NetworkManager (Bookworm / RPi OS 12+)  -> nmcli
#   - dhcpcd         (Bullseye and earlier)   -> /etc/dhcpcd.conf
#
# Safe to re-run (idempotent). Prints what it changed. Reboot or reconnect
# afterwards for the address to take effect cleanly.
#
set -euo pipefail

# ---------------- CONFIG ----------------
STATIC_IP="10.0.124.5"
PREFIX="24"                 # 255.255.255.0
GATEWAY="10.0.124.1"
DNS="10.0.124.1 8.8.8.8"
IFACE="${1:-}"             # optional: pass wlan0 or eth0; auto-detected if empty
# ----------------------------------------

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

# Auto-detect the primary interface (the one with the default route) if not given.
if [[ -z "$IFACE" ]]; then
  IFACE="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
  IFACE="${IFACE:-wlan0}"
fi
echo "==> Target interface: $IFACE"
echo "==> Static IP: $STATIC_IP/$PREFIX  gw $GATEWAY  dns [$DNS]"

if command -v nmcli >/dev/null 2>&1 && systemctl is-active --quiet NetworkManager; then
  echo "==> Detected NetworkManager. Configuring via nmcli."
  # Find the active connection name bound to this interface.
  CON="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v d="$IFACE" '$2==d {print $1; exit}')"
  if [[ -z "$CON" ]]; then
    CON="$(nmcli -t -f NAME,DEVICE connection show | awk -F: -v d="$IFACE" '$2==d {print $1; exit}')"
  fi
  CON="${CON:-siloos-static}"
  echo "    Using connection profile: $CON"
  nmcli connection modify "$CON" \
    ipv4.addresses "${STATIC_IP}/${PREFIX}" \
    ipv4.gateway "$GATEWAY" \
    ipv4.dns "${DNS// /,}" \
    ipv4.method manual
  echo "==> Bringing connection back up..."
  nmcli connection up "$CON" || echo "    (up may drop your SSH session; that's expected)"
  echo "==> Done (NetworkManager). New address should be $STATIC_IP."

elif [[ -f /etc/dhcpcd.conf ]]; then
  echo "==> Detected dhcpcd. Configuring /etc/dhcpcd.conf."
  CONF="/etc/dhcpcd.conf"
  cp "$CONF" "${CONF}.bak.$(date +%s)"
  # Strip any prior SiloOS-managed block, then append a fresh one.
  sed -i '/# >>> SiloOS static IP >>>/,/# <<< SiloOS static IP <<</d' "$CONF"
  cat >> "$CONF" <<EOF
# >>> SiloOS static IP >>>
interface $IFACE
static ip_address=${STATIC_IP}/${PREFIX}
static routers=${GATEWAY}
static domain_name_servers=${DNS}
# <<< SiloOS static IP <<<
EOF
  echo "==> Restarting dhcpcd..."
  systemctl restart dhcpcd || echo "    (restart may drop your SSH session; that's expected)"
  echo "==> Done (dhcpcd). New address should be $STATIC_IP."

else
  echo "!! Could not detect NetworkManager or dhcpcd. Configure the static IP manually." >&2
  exit 1
fi

echo
echo "Verify from another machine:  ping $STATIC_IP  &&  ssh siloos@$STATIC_IP"
echo "Also ensure services are enabled:  sudo systemctl enable --now ssh scale_bridge"
