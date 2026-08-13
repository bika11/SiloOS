# Pi Hardening & Health Monitoring

Recurrence prevention for host-level "SiloOS seems down" outages, added 2026-08-13 after an outage
that recovered only via a full power cycle (see `.agent/LESSONS.md` → 2026-08-13). Goal: make the
**next** incident (a) self-recovering without a manual power cycle and (b) fully diagnosable.

All tooling is **dose-safe** — nothing here restarts `scale_bridge`, and the one host-affecting step
(Wi-Fi) is gated on dose-idle.

---

## Components

### 1. Persistent journald — `tools/pi_harden.sh` step 1
Default journald here was volatile (`/var/log/journal` empty → logs in `/run`, wiped every reboot),
so post-reboot the trigger was unrecoverable. `pi_harden.sh` writes
`/etc/systemd/journald.conf.d/persistent.conf`:

```ini
[Journal]
Storage=persistent
SystemMaxUse=200M
MaxRetentionSec=1month
```

Verify: `journalctl --list-boots` shows ≥2 boots; `journalctl -b -1` returns the previous boot.

### 2. Hardware watchdog — VERIFY ONLY (never override)
> ⚠️ **Do not add a `RuntimeWatchdogSec` override.** RPi OS already ships a working 1-min watchdog
> via `/usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf`. A wedged host already
> auto-reboots. Setting it to `20s` **reboot-loops the Pi** (bcm2711 misbehaves below the vendor
> value) — this happened on 2026-08-13. `pi_harden.sh` step 2 only *verifies* the watchdog is armed.

Verify: `systemctl show -p RuntimeWatchdogUSec --value` → `1min`, and **no**
`/etc/systemd/system.conf.d/watchdog.conf`. Effective source: `systemd-analyze cat-config systemd/system.conf`.

If it ever loops: `sudo rm /etc/systemd/system.conf.d/watchdog.conf && sudo systemctl daemon-reexec`
(retry in a loop — SSH windows are ~15 s during the loop).

### 3. Wi-Fi power-save disable — `tools/pi_harden.sh` step 3 (idle-gated)
`nmcli connection modify <wlan0-profile> 802-11-wireless.powersave 2`, persisted to the profile.
Only re-activates (a brief wlan0 bounce) if the running radio still has power-save on, and **skips
entirely if a dose is armed/running** (`restart_bridge_safe.sh --check`). On this Pi the `scanomat`
profile already has it disabled.

### 4. Health breadcrumb + disk guard — `tools/pi_healthlog.sh` (via `pi-healthlog.timer`, 60 s)
Appends one line/minute to `/home/siloos/health.log`:

```
<ts> throttled=0x0 temp=61.3 wifi_dbm=-61 wifi_link=49 ping_gw=ok bridge=active dash=active \
     disk_free_mb=18987 disk_used_pct=33 inode_free_pct=88
```

This is the trail that fingers the next wedge: `throttled` bit set → undervoltage; `ping_gw=FAIL`
while `bridge=active` → Wi-Fi drop; a gap in timestamps before a watchdog reboot → full host stall.

**Disk guard** (same cycle, so logging can't fill the SD card): WARN <2 GB free / >90% used /
<15% inodes; CRITICAL <1 GB / >95% → self-heals in order (`journalctl --vacuum-size=100M` →
truncate own logs to last 2000 lines → prune `/var/log/*.gz` older than 14 d), then re-checks and
escalates a loud `DISK-CRITICAL persists` marker (also to journald via `systemd-cat -p err`) if it
still can't recover. Thresholds are env-overridable for testing. Routine bound is
`tools/systemd/siloos.logrotate` → `/etc/logrotate.d/siloos` (daily, rotate 7, compress, maxsize 20M).

---

## Deploy / re-run

```bash
# from repo root (LF line-endings enforced on *.sh)
scp -i ./siloos_key tools/pi_harden.sh tools/pi_healthlog.sh tools/install_healthlog.sh \
    siloos@siloos.local:/home/siloos/tools/
scp -i ./siloos_key tools/systemd/pi-healthlog.service tools/systemd/pi-healthlog.timer \
    tools/systemd/siloos.logrotate siloos@siloos.local:/home/siloos/tools/systemd/

# harden (detached; survives SSH drops). Applies journald + verifies watchdog + idle-gated wifi.
ssh -i ./siloos_key siloos@siloos.local \
  "sudo systemd-run --unit=siloos-harden --collect bash /home/siloos/tools/pi_harden.sh"
#   poll: tail -f /home/siloos/pi_harden.log   (ends with HARDEN-DONE)
#   ONLY=wifi bash pi_harden.sh   → run just the idle-gated Wi-Fi step

# install + start the health-log timer + logrotate (idempotent)
ssh -i ./siloos_key siloos@siloos.local "sudo bash /home/siloos/tools/install_healthlog.sh"
```

Notes: config files are written with `printf|tee`, **not** here-docs (here-docs fed to `tee` under
`systemd-run` produced 0-byte files). mDNS to `siloos.local` is flaky on this LAN — retry SSH in a loop.

## After a future outage — first moves
1. `journalctl -b -1 -n 100` — the previous boot's tail (now persisted).
2. `tail -n 120 /home/siloos/health.log` — throttle/ping/disk trend right up to the wedge.
3. `journalctl --list-boots` — reboot cadence (rapid = watchdog/loop; single = one-off).
