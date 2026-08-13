#!/usr/bin/env bash
# pi_harden.sh — one-shot, idempotent hardening of the SiloOS Pi so the next
# "seems to be down" incident is (a) self-recovering without a manual power
# cycle and (b) fully diagnosable afterwards.
#
# WHY: an outage recovered only after a full power cycle. scale_bridge is
# Restart=always, so a dead *bridge* would have self-revived — needing a reboot
# means the whole host wedged (Wi-Fi driver / kernel-net / power). And the
# pre-incident logs were gone because journald was not persisting across reboots,
# so the trigger was unrecoverable. This script closes those gaps.
#
# Steps (each idempotent, re-runnable):
#   1. Persistent journald         — logs survive reboots (diagnosability)
#   2. Verify vendor watchdog       — READ-ONLY: confirm auto-reboot is armed
#   3. Disable Wi-Fi power-save     — removes the leading "appears-down" cause
#                                     (GATED to idle: skipped mid-dose)
#
# WATCHDOG NOTE (hard-won 2026-08-13): Raspberry Pi OS ALREADY ships a working
# hardware watchdog via /usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf
# (RuntimeWatchdogSec=1m). That already auto-reboots a wedged host — no override
# needed. An earlier attempt to tighten it to 20s put the Pi into a REBOOT LOOP
# (the bcm2711 watchdog misbehaves below the vendor-tuned value). So this script
# only VERIFIES the vendor watchdog; it never rewrites it. Do NOT add a
# RuntimeWatchdogSec override here.
#
# NONE of these steps restart scale_bridge, so they are dose-safe. Step 3 can
# briefly bounce wlan0, so it is skipped while a dose is armed/running.
#
# Run detached on the Pi (survives SSH drops):
#   sudo systemd-run --unit=harden --collect bash /home/siloos/tools/pi_harden.sh
#   then: tail -f /home/siloos/pi_harden.log   (ends with a HARDEN-DONE marker)
set -uo pipefail

LOG="${LOG:-/home/siloos/pi_harden.log}"
GUARD="${GUARD:-/home/siloos/tools/restart_bridge_safe.sh}"

# --- journald caps ---
JOURNAL_MAX_USE="200M"
JOURNAL_RETENTION="1month"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

log() { echo "$(date '+%F %T') | $*" | tee -a "$LOG"; }

log "=== pi_harden start ==="

# ---------------------------------------------------------------------------
# Step 1 — Persistent journald
# ---------------------------------------------------------------------------
step_journald() {
  log "[1/3] persistent journald"
  $SUDO mkdir -p /etc/systemd/journald.conf.d /var/log/journal
  # Give the journal dir the ownership/ACLs journald expects.
  $SUDO systemd-tmpfiles --create --prefix /var/log/journal >/dev/null 2>&1 || true
  # NB: printf|tee, not a here-doc — a here-doc fed to `tee` under `systemd-run`
  # produced 0-byte files here; printf is reliable in that execution context.
  printf '%s\n' \
    '# Managed by pi_harden.sh — persist logs across reboots so incidents stay diagnosable.' \
    '[Journal]' \
    'Storage=persistent' \
    "SystemMaxUse=${JOURNAL_MAX_USE}" \
    "MaxRetentionSec=${JOURNAL_RETENTION}" \
    | $SUDO tee /etc/systemd/journald.conf.d/persistent.conf >/dev/null
  $SUDO systemctl restart systemd-journald
  $SUDO journalctl --flush 2>/dev/null || true
  sleep 1
  local boots
  boots=$($SUDO ls /var/log/journal/*/ 2>/dev/null | grep -c '\.journal$' || true)
  log "[1/3] journald restarted; on-disk journal files=${boots} (storage=persistent)"
}

# ---------------------------------------------------------------------------
# Step 2 — Verify the vendor hardware watchdog (READ-ONLY — never override it)
# ---------------------------------------------------------------------------
step_watchdog_verify() {
  log "[2/3] verify vendor hardware watchdog (read-only)"
  local wusec vendor
  wusec=$($SUDO systemctl show -p RuntimeWatchdogUSec --value 2>/dev/null || echo "?")
  vendor="absent"
  [ -f /usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf ] && vendor="present"
  if [ -f /etc/systemd/system.conf.d/watchdog.conf ]; then
    log "[2/3] WARN: an /etc override of the watchdog exists — verify it is not <1min (20s reboot-loops this Pi). Remove it to fall back to the vendor value."
  fi
  if [ "$wusec" = "0" ] || [ -z "$wusec" ]; then
    log "[2/3] WARN: hardware watchdog appears OFF (RuntimeWatchdogUSec=$wusec) — a wedged Pi will NOT auto-reboot"
  else
    log "[2/3] OK: watchdog armed (RuntimeWatchdogUSec=$wusec; rpi vendor drop-in=$vendor). A wedged host auto-reboots."
  fi
}

# ---------------------------------------------------------------------------
# Step 3 — Persistently disable Wi-Fi power-save (idle-gated)
# ---------------------------------------------------------------------------
step_wifi_powersave() {
  log "[3/3] Wi-Fi power-save disable"
  # Idle gate: never bounce wlan0 during a live dose.
  if [ -x "$GUARD" ]; then
    if ! bash "$GUARD" --check >>"$LOG" 2>&1; then
      log "[3/3] SKIP: a dose is armed/running (idle gate). Re-run pi_harden.sh when idle."
      return 0
    fi
  else
    log "[3/3] WARN: guard $GUARD not found — proceeding without idle gate"
  fi

  if ! command -v nmcli >/dev/null 2>&1; then
    log "[3/3] WARN: nmcli not present — skipping (not NetworkManager-managed?)"
    return 0
  fi
  # Resolve the active wlan0 connection profile.
  local conn
  conn=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null \
           | awk -F: '$2=="wlan0"{print $1; exit}')
  if [ -z "$conn" ]; then
    log "[3/3] WARN: no active wlan0 connection profile found — skipping"
    return 0
  fi
  # 2 = disable power save, persisted to the profile (survives reboot).
  $SUDO nmcli connection modify "$conn" 802-11-wireless.powersave 2
  # Only re-activate (a brief wlan0 bounce) if the RUNNING radio still has power
  # save ON — avoids needlessly dropping the live link when it's already off.
  local ps_now
  ps_now=$($SUDO iw dev wlan0 get power_save 2>/dev/null | awk '{print $NF}')
  if [ "$ps_now" = "on" ]; then
    log "[3/3] runtime power_save=on — re-activating '$conn' to apply (brief wlan0 bounce, idle)"
    $SUDO nmcli connection up "$conn" >>"$LOG" 2>&1 || true
    sleep 2
    ps_now=$($SUDO iw dev wlan0 get power_save 2>/dev/null | awk '{print $NF}')
  fi
  log "[3/3] wifi.powersave persisted on profile '$conn'; runtime power_save=${ps_now:-unknown}"
}

# ONLY=wifi runs just the idle-gated Wi-Fi step (used by the detached idle-waiter
# so it doesn't needlessly re-restart journald). Default = all.
case "${ONLY:-all}" in
  wifi) step_wifi_powersave ;;
  all)  step_journald; step_watchdog_verify; step_wifi_powersave ;;
  *)    log "unknown ONLY='${ONLY}' (use: all|wifi)"; exit 2 ;;
esac

log "=== HARDEN-DONE ==="
