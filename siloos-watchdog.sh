#!/bin/bash
# SiloOS Watchdog - Self-healing health checker
# Runs via cron every 2 minutes to ensure all services are up
# Logs to /var/log/siloos-watchdog.log

LOG="/var/log/siloos-watchdog.log"
DOSE_LOCKFILE="/tmp/siloos-dosing.lock"
DOSE_LOCK_MAX_AGE=300  # 5 minutes — if lock is older, assume stale (dose can't run that long)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
FIXES=0

log() {
    echo "[$TIMESTAMP] $1" >> "$LOG"
}

fix() {
    log "FIX: $1"
    FIXES=$((FIXES + 1))
}

# --- Helper: is a dose actively in progress? ---
dose_active() {
    if [ ! -f "$DOSE_LOCKFILE" ]; then
        return 1  # No lockfile = no dose
    fi

    # Check if the PID in the lockfile is still alive
    LOCK_PID=$(python3 -c "import json; print(json.load(open('$DOSE_LOCKFILE')).get('pid',0))" 2>/dev/null)
    if [ -n "$LOCK_PID" ] && [ "$LOCK_PID" -gt 0 ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        # PID alive — check if lock is suspiciously old (stale)
        LOCK_AGE=$(python3 -c "
import json, time
ts = json.load(open('$DOSE_LOCKFILE')).get('ts', 0)
print(int(time.time() - ts))
" 2>/dev/null)
        if [ -n "$LOCK_AGE" ] && [ "$LOCK_AGE" -lt "$DOSE_LOCK_MAX_AGE" ]; then
            return 0  # Dose is genuinely active
        else
            log "WARN: Dose lockfile is ${LOCK_AGE}s old (max ${DOSE_LOCK_MAX_AGE}s) — treating as stale"
            rm -f "$DOSE_LOCKFILE"
            return 1
        fi
    else
        # PID is dead — stale lockfile from a crash
        log "WARN: Stale dose lockfile (PID $LOCK_PID dead), cleaning up"
        rm -f "$DOSE_LOCKFILE"
        return 1
    fi
}

# ============================================================
# 1. BLUETOOTH — the most critical subsystem
# ============================================================

# --- 1a. RF-Kill (soft block) ---
if rfkill list bluetooth | grep -q "Soft blocked: yes"; then
    rfkill unblock bluetooth
    fix "Bluetooth was soft-blocked, unblocked"
    sleep 2
fi

# --- 1b. Bluetooth service ---
if ! systemctl is-active --quiet bluetooth; then
    systemctl start bluetooth
    fix "bluetooth.service was down, started"
    sleep 3
fi

# --- 1c. HCI adapter present and UP ---
if ! hciconfig hci0 2>/dev/null | grep -q "UP RUNNING"; then
    # Adapter exists but not UP, or not present at all
    if hciconfig hci0 >/dev/null 2>&1; then
        # Adapter exists but is DOWN — bring it up
        hciconfig hci0 up
        fix "hci0 adapter was DOWN, brought UP"
        sleep 2
    else
        log "CRITICAL: No hci0 Bluetooth adapter found — hardware issue?"
    fi
fi

# --- 1d. Adapter powered on (BlueZ level) ---
BT_POWERED=$(bluetoothctl show 2>/dev/null | grep "Powered:" | awk '{print $2}')
if [ "$BT_POWERED" = "no" ]; then
    bluetoothctl power on >/dev/null 2>&1
    fix "Bluetooth adapter was powered off, powered on"
    sleep 2
fi

# --- 1e. D-Bus alive (BlueZ talks through it) ---
if ! busctl status org.bluez >/dev/null 2>&1; then
    systemctl restart bluetooth
    fix "BlueZ D-Bus registration missing, restarted bluetooth.service"
    sleep 3
fi

# ============================================================
# 2. BRIDGE SERVICE
# ============================================================

BRIDGE_SERVICE=""
if systemctl is-enabled --quiet silo-bridge 2>/dev/null; then
    BRIDGE_SERVICE="silo-bridge"
elif systemctl is-enabled --quiet scale_bridge 2>/dev/null; then
    BRIDGE_SERVICE="scale_bridge"
fi

if [ -n "$BRIDGE_SERVICE" ]; then
    if ! systemctl is-active --quiet "$BRIDGE_SERVICE"; then
        if dose_active; then
            log "SKIP: $BRIDGE_SERVICE appears down but dose lockfile active — NOT restarting"
        else
            systemctl restart "$BRIDGE_SERVICE"
            fix "$BRIDGE_SERVICE was down, restarted"
        fi
    fi
else
    log "WARN: No bridge service (silo-bridge or scale_bridge) is enabled"
fi

# ============================================================
# 3. DASHBOARD SERVICE
# ============================================================

if systemctl is-enabled --quiet silo-dashboard 2>/dev/null; then
    if ! systemctl is-active --quiet silo-dashboard; then
        systemctl restart silo-dashboard
        fix "silo-dashboard was down, restarted"
    fi
fi

# ============================================================
# 4. DEEP HEALTH CHECKS (services claim to be running)
# ============================================================

# --- 4a. WebSocket port 8765 actually listening ---
if [ -n "$BRIDGE_SERVICE" ] && systemctl is-active --quiet "$BRIDGE_SERVICE"; then
    if ! ss -tlnp | grep -q ':8765'; then
        if dose_active; then
            log "SKIP: Port 8765 not listening but dose active — NOT restarting"
        else
            log "WARN: Bridge service active but port 8765 not listening, restarting"
            systemctl restart "$BRIDGE_SERVICE"
            fix "$BRIDGE_SERVICE running but WS port 8765 dead, restarted"
        fi
    fi
fi

# --- 4b. Dashboard port 5173 actually responding ---
if systemctl is-active --quiet silo-dashboard 2>/dev/null; then
    if ! ss -tlnp | grep -q ':5173'; then
        systemctl restart silo-dashboard
        fix "silo-dashboard running but port 5173 not listening, restarted"
    fi
fi

# ============================================================
# 5. HARDWARE CHECKS
# ============================================================

# --- 5a. Serial device present (scale USB adapter) ---
if [ ! -e /dev/ttyUSB0 ]; then
    log "WARN: /dev/ttyUSB0 not found — scale USB adapter may be disconnected"
fi

# ============================================================
# 6. LOG ROTATION (keep log under 1MB)
# ============================================================

if [ -f "$LOG" ]; then
    LOG_SIZE=$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null || echo 0)
    if [ "$LOG_SIZE" -gt 1048576 ]; then
        tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
        log "Log rotated (was ${LOG_SIZE} bytes)"
    fi
fi

# Only log if something was fixed (keeps log clean)
if [ "$FIXES" -gt 0 ]; then
    log "Watchdog completed: $FIXES fix(es) applied"
elif [ ! -f "$LOG" ] || [ "$(wc -l < "$LOG")" -lt 2 ]; then
    log "Watchdog OK - all services healthy (first run)"
fi
