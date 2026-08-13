#!/usr/bin/env bash
# pi_healthlog.sh — one health sample, appended to /home/siloos/health.log.
# Driven by pi-healthlog.timer every 60s. This is the persistent breadcrumb
# trail that lets us tell, AFTER the next incident, whether the Pi wedged from
# undervoltage, a Wi-Fi drop, or a full host stall — plus a self-healing disk
# guard so our own logging can never fill the SD card.
#
# One line per run (space-separated key=value), e.g.:
#   2026-08-13T08:30:01+02:00 throttled=0x0 temp=61.3 wifi_dbm=-61 wifi_link=49 \
#     ping_gw=ok bridge=active dash=active disk_free_mb=19456 disk_used_pct=33 inode_free_pct=88
set -uo pipefail

HEALTH_LOG="${HEALTH_LOG:-/home/siloos/health.log}"
HARDEN_LOG="${HARDEN_LOG:-/home/siloos/pi_harden.log}"

# --- disk-guard thresholds (named constants; env-overridable for testing) ---
WARN_FREE_MB="${WARN_FREE_MB:-2048}"        # WARN under 2 GB free
CRIT_FREE_MB="${CRIT_FREE_MB:-1024}"        # CRITICAL under 1 GB free
WARN_USED_PCT="${WARN_USED_PCT:-90}"        # WARN over 90% used
CRIT_USED_PCT="${CRIT_USED_PCT:-95}"        # CRITICAL over 95% used
WARN_INODE_FREE_PCT="${WARN_INODE_FREE_PCT:-15}"  # WARN under 15% inodes free
LOG_KEEP_LINES="${LOG_KEEP_LINES:-2000}"    # lines to keep when emergency-truncating our logs

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

ts() { date -Iseconds; }

# ---- gather metrics -------------------------------------------------------
throttled=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2 || echo "NA")
temp=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//;s/.C//' || echo "NA")

# wlan0 signal from /proc/net/wireless: link quality and level(dBm).
read -r wifi_link wifi_dbm < <(awk '/wlan0/{gsub(/\./,"",$3); gsub(/\./,"",$4); print $3, $4; exit}' /proc/net/wireless 2>/dev/null)
wifi_link="${wifi_link:-NA}"; wifi_dbm="${wifi_dbm:-NA}"

# gateway reachability (derived, never hardcoded).
gw=$(ip route show default 2>/dev/null | awk '/default/{print $3; exit}')
if [ -n "$gw" ] && ping -c1 -W2 "$gw" >/dev/null 2>&1; then ping_gw="ok"; else ping_gw="FAIL"; fi

bridge=$(systemctl is-active scale_bridge 2>/dev/null || echo "unknown")
dash=$(systemctl is-active silo-dashboard 2>/dev/null || echo "unknown")

# disk: free MB, used %, free inode %  (root fs)
read -r disk_used_pct disk_free_mb < <(df -PBM / 2>/dev/null | awk 'NR==2{gsub(/[M%]/,""); print $5, $4}')
inode_free_pct=$(df -iP / 2>/dev/null | awk 'NR==2{gsub(/%/,""); print 100-$5}')
disk_used_pct="${disk_used_pct:-NA}"; disk_free_mb="${disk_free_mb:-NA}"; inode_free_pct="${inode_free_pct:-NA}"

printf '%s throttled=%s temp=%s wifi_dbm=%s wifi_link=%s ping_gw=%s bridge=%s dash=%s disk_free_mb=%s disk_used_pct=%s inode_free_pct=%s\n' \
  "$(ts)" "$throttled" "$temp" "$wifi_dbm" "$wifi_link" "$ping_gw" "$bridge" "$dash" \
  "$disk_free_mb" "$disk_used_pct" "$inode_free_pct" >> "$HEALTH_LOG"

# ---- disk guard -----------------------------------------------------------
# Emergency backstop only; logrotate is the routine bound. Never touches scale_bridge.
is_num() { case "$1" in ''|*[!0-9]*) return 1;; *) return 0;; esac }

disk_guard() {
  is_num "$disk_free_mb" || return 0
  is_num "$disk_used_pct" || return 0

  local crit=0 warn=0
  { [ "$disk_free_mb" -lt "$CRIT_FREE_MB" ] || [ "$disk_used_pct" -gt "$CRIT_USED_PCT" ]; } && crit=1
  { [ "$disk_free_mb" -lt "$WARN_FREE_MB" ] || [ "$disk_used_pct" -gt "$WARN_USED_PCT" ]; } && warn=1
  if is_num "$inode_free_pct" && [ "$inode_free_pct" -lt "$WARN_INODE_FREE_PCT" ]; then warn=1; fi

  if [ "$crit" -eq 1 ]; then
    echo "$(ts) DISK-CRITICAL free_mb=$disk_free_mb used_pct=$disk_used_pct — self-healing" >> "$HEALTH_LOG"
    # 1) reclaim the persistent journal first (biggest, safest lever)
    $SUDO journalctl --vacuum-size=100M >>"$HEALTH_LOG" 2>&1 || true
    # 2) trim our own logs to their tails
    for f in "$HEALTH_LOG" "$HARDEN_LOG"; do
      [ -f "$f" ] && tail -n "$LOG_KEEP_LINES" "$f" > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f"
    done
    # 3) drop old compressed rotations
    $SUDO find /var/log -name '*.gz' -mtime +14 -delete 2>/dev/null || true
    # re-check
    local nf
    nf=$(df -PBM / 2>/dev/null | awk 'NR==2{gsub(/M/,""); print $4}')
    if is_num "$nf" && [ "$nf" -lt "$CRIT_FREE_MB" ]; then
      echo "$(ts) DISK-CRITICAL persists after cleanup free_mb=$nf — MANUAL ATTENTION NEEDED" | tee -a "$HEALTH_LOG" | $SUDO systemd-cat -t siloos-healthlog -p err
    else
      echo "$(ts) DISK recovered free_mb=$nf" >> "$HEALTH_LOG"
    fi
  elif [ "$warn" -eq 1 ]; then
    echo "$(ts) DISK-WARN free_mb=$disk_free_mb used_pct=$disk_used_pct inode_free_pct=$inode_free_pct" >> "$HEALTH_LOG"
  fi
}

disk_guard
