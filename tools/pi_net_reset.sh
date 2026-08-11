#!/usr/bin/env bash
# Revert the experimental ARP sysctls and flush neighbor caches so IPv4 ARP
# re-learns cleanly. Safe: only affects IPv4 ARP behavior, cannot lock out the
# IPv6/mDNS admin path. Run detached on the Pi.
set -uo pipefail
LOG=/home/siloos/pi_net_reset.log
exec > >(tee "$LOG") 2>&1
echo "===== net reset ====="
rm -f /etc/sysctl.d/99-siloos-arp.conf
sysctl -w net.ipv4.conf.all.arp_ignore=0     2>&1 || true
sysctl -w net.ipv4.conf.all.arp_announce=0   2>&1 || true
sysctl -w net.ipv4.conf.default.arp_ignore=0 2>&1 || true
sysctl -w net.ipv4.conf.default.arp_announce=0 2>&1 || true
ip neigh flush all 2>&1 || true
echo "--- interfaces ---"; ip -4 -o addr show | grep -v " lo "
echo "--- routes ---"; ip route
echo "--- can the Pi reach its gateway over each iface? ---"
ping -c2 -I eth0  10.0.124.1 2>&1 | tail -2 || true
ping -c2 -I wlan0 10.0.124.1 2>&1 | tail -2 || true
echo "RESET_DONE"
