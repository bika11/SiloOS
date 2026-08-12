#!/usr/bin/env bash
# restart_bridge_safe.sh — guarded restart of the scale_bridge service.
#
# WHY: restarting the bridge severs the Pi's gravimetric control loop. If a dose
# is dispensing when that happens, nothing sends the STOP at target and the hopper
# overflows (kilograms of beans onto the machine/floor). EVERY deploy/recovery path
# that restarts scale_bridge MUST go through this guard instead of a bare
# `systemctl restart scale_bridge`.
#
# Runs ON THE PI. It decides "is a dose live?" from the audit log: a dose is active
# when the most recent dose-lifecycle event is `pi_dose_armed`/`pi_dose_running`
# with no later terminal (`pi_dose_complete`/`pi_force_abort`) — and that event is
# recent (a crash-left "running" line older than the max dose time can't be a real
# live dose, so it must not block recovery forever).
#
# Modes:
#   (no args)     restart iff idle; if a dose is active, SKIP (exit 3).
#   --check       report active/idle and exit (0 idle, 3 active); never restarts.
#   --wait N      poll up to N seconds for the dose to finish, then restart.
#   --force       restart even if a dose is active (LAST RESORT — may overflow).
#
# Exit codes: 0 restarted (or idle on --check) · 3 skipped, dose active · 2 usage
#             · non-zero other = restart/verify error.
set -uo pipefail

SVC="scale_bridge"
LOG="${LOG:-/home/siloos/logs/dispensing.log}"   # overridable for testing
STALE_AFTER="${STALE_AFTER:-900}"   # seconds; > max_dispense_s (600) + margin
POLL_EVERY=3

MODE="restart"        # restart | check
WAIT_S=0
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --wait)  WAIT_S="${2:-0}"; shift ;;
    --force) FORCE=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "restart_bridge_safe: unknown arg '$1'" >&2; exit 2 ;;
  esac
  shift
done

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

# Returns 0 (true) if a dose is currently live.
dose_active() {
  local last ts now age
  [ -r "$LOG" ] || return 1
  last=$(grep -E '"event": "pi_dose_(armed|running|complete)"|"event": "pi_force_abort"' "$LOG" 2>/dev/null | tail -1)
  [ -n "$last" ] || return 1
  # Not active unless the newest lifecycle event is armed/running.
  echo "$last" | grep -qE '"event": "pi_dose_(armed|running)"' || return 1
  # A "running" line older than a full max-length dose can't be live (the
  # controller's own max-time abort would have fired) — treat as stale, allow restart.
  ts=$(echo "$last" | grep -oE '"ts": *[0-9.]+' | head -1 | grep -oE '[0-9.]+' | head -1)
  [ -n "$ts" ] || return 0     # can't parse ts → be safe, treat as active
  now=$(date +%s)
  age=$(awk -v a="$now" -v b="${ts%.*}" 'BEGIN{print a-b}')
  [ "$age" -lt "$STALE_AFTER" ]
}

active_line() {
  grep -E '"event": "pi_dose_(armed|running)"' "$LOG" 2>/dev/null | tail -1
}

do_restart() {
  echo "[restart_bridge_safe] restarting $SVC ..."
  $SUDO systemctl restart "$SVC" || { echo "[restart_bridge_safe] restart FAILED" >&2; exit 1; }
  sleep 4
  local st; st=$($SUDO systemctl is-active "$SVC" 2>/dev/null)
  echo "[restart_bridge_safe] is-active=$st"
  [ "$st" = "active" ] || { echo "[restart_bridge_safe] service not active after restart" >&2; exit 1; }
  echo "[restart_bridge_safe] OK"
}

# --- check mode: report and exit, never restart ---
if [ "$MODE" = "check" ]; then
  if dose_active; then echo "[restart_bridge_safe] DOSE ACTIVE: $(active_line)"; exit 3
  else echo "[restart_bridge_safe] idle"; exit 0; fi
fi

# --- restart mode ---
if dose_active; then
  echo "[restart_bridge_safe] a dose is LIVE: $(active_line)"
  if [ "$WAIT_S" -gt 0 ]; then
    echo "[restart_bridge_safe] waiting up to ${WAIT_S}s for it to finish ..."
    waited=0
    while [ "$waited" -lt "$WAIT_S" ]; do
      sleep "$POLL_EVERY"; waited=$((waited + POLL_EVERY))
      dose_active || { echo "[restart_bridge_safe] dose finished after ${waited}s"; do_restart; exit 0; }
    done
    echo "[restart_bridge_safe] still active after ${WAIT_S}s"
  fi
  if [ "$FORCE" -eq 1 ]; then
    echo "[restart_bridge_safe] --force: restarting DESPITE a live dose (overflow risk!)"
    do_restart; exit 0
  fi
  echo "[restart_bridge_safe] SKIPPING restart (dose active). Re-run when idle, or --wait N / --force." >&2
  exit 3
fi

do_restart
