# SiloOS Lessons Learned

Durable lessons distilled from real incidents. Each links to the evidence.
When you burn hours on something, add the lesson here so the next person doesn't.

---

## 2026-08-10 — "Dashboard not connecting" (full RCA: `RCA-2026-08-10-not-connecting.md`)

A single "not connecting" symptom hid **six** stacked problems. The debugging took far longer than the fix. Lessons:

### Networking / infrastructure
1. **A dead interface can be the *preferred* route and silently black-hole traffic.**
   The ethernet cable gave `eth0` an IP and a lower route metric than Wi-Fi, but that port had no path to the gateway. All IPv4 vanished while IPv6 kept working. → When connectivity is partial/weird, check **per-interface gateway reachability and route metrics**, not just "is there a link":
   ```bash
   ip route                        # lower metric = preferred
   ping -c2 -I <iface> <gateway>   # per-interface, both interfaces
   ```
2. **Test IPv4 *and* IPv6 separately.** `siloos.local` had both A and AAAA records. The bridge bound dual-stack (worked over IPv6), the dashboard bound IPv4-only (failed over IPv6) — which looked like a "port-specific" bug but wasn't. Use `curl -4` / `curl -6` and check `ss -tln` for `0.0.0.0` **and** `[::]`.
3. **Bind services dual-stack.** `vite --host` (not `--host 0.0.0.0`). aiohttp defaults to dual-stack. Match whatever the mDNS name resolves to.
4. **Prefer mDNS (`siloos.local`) over hardcoded IPs** for a device whose IP drifts. Hardcoded IPs in configs broke this project repeatedly across sessions. Keep runtime endpoints derived from `window.location.hostname`.
5. **Pin the drifting host** (router DHCP reservation for the MAC) so non-mDNS clients (some Android browsers) also work.

### Process / method
6. **Verify the whole path end-to-end; never trust a half-signal.** A TCP-open port, a "connected" WebSocket, or a name that resolves does **not** mean the system works. Here a hollow laptop mock answered `:8765` and hijacked `siloos.local`, making things *look* connected while reaching nothing.
7. **Rule out your own tooling / test host first.** Early probes "found the Pi" at the laptop's own IP because a local `tools/mdns_publisher.py` was advertising the name. Check `what does the name resolve to` and `is it my own machine` before chasing the remote host.
8. **On a flaky remote link, stop hand-running multi-step commands.** They drop mid-stream and corrupt state. Push a self-contained, idempotent script and launch it **detached** so it completes regardless of the SSH session:
   ```bash
   sudo systemd-run --unit=job --collect bash /home/siloos/job.sh   # runs independently
   # script tees to a log ending in a MARKER; poll the log from the client
   ```
   Add a **safety net** for risky changes (e.g. `systemd-run --on-active=300 … ip link set eth0 up` before taking eth0 down).
9. **Don't trust stale docs/memory for facts you can check.** Docs said "Pi 3B+"; it was a Pi 4. Verify hardware/service state live before reasoning from it (`cat /proc/device-tree/model`, `systemctl is-enabled <svc>`).
10. **A claimed-enabled service may not exist.** `scale_bridge` was "enabled for boot" in the docs but `systemctl is-enabled` returned `not-found` on this Pi. Confirm services actually exist and are enabled; give them `Restart=always` + `WantedBy=multi-user.target`.

### Reusable assets this produced
- Skill: `siloos-pi-recovery` (diagnostic playbook, now includes dead-route + dual-stack gotchas)
- `tools/`: `install_bridge_service.sh`, `pi_full_fix.sh`, `pi_eth0_off.sh`, `pi_net_reset.sh`, `set_pi_static_ip.sh`, `scale_bridge.service`

---

## 2026-08-13 — "SiloOS seems down" (host wedge) + a self-inflicted watchdog reboot-loop

The Pi recovered only after a **full power cycle**, not a service restart. Since `scale_bridge` is
`Restart=always`, a dead *bridge* self-revives — needing a reboot means the **whole host wedged**
(Wi-Fi/kernel-net/power). The exact trigger was **unrecoverable**: journald wasn't persisting logs,
so the reboot wiped every pre-incident line.

### Lessons
1. **When a full power cycle is required (not a service restart), suspect the host, not the app.**
   `Restart=always` services can't be the whole story — look at network stack, Wi-Fi driver, power.
2. **Make logs persistent BEFORE you need them.** Default journald here was volatile
   (`/var/log/journal` empty → all logs in `/run`, wiped on reboot). Every incident was
   un-diagnosable after the mandatory reboot. Fix: `Storage=persistent` (+ `SystemMaxUse` cap).
3. **⚠️ Do NOT override the Raspberry Pi vendor watchdog. Never set sub-1-min `RuntimeWatchdogSec`.**
   RPi OS already ships `/usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf`
   (`RuntimeWatchdogSec=1m`) — a wedged host already auto-reboots. My pre-check missed it because I
   only grepped `/etc/systemd/system.conf`, not `/usr/lib/.../system.conf.d/`. Tightening it to
   **`20s` put the Pi into a REBOOT LOOP** (6 boots in ~60 s; the bcm2711 watchdog misbehaves below
   the vendor value). Recovery: `sudo rm /etc/systemd/system.conf.d/watchdog.conf && sudo systemctl
   daemon-reexec` (retry in a loop — SSH windows are ~15 s during the loop). Reinforces lesson #9:
   **verify facts live** (`systemd-analyze cat-config systemd/system.conf` shows the *effective*
   source, incl. `/usr/lib` drop-ins).
4. **`here-doc | tee` writes 0-byte files under `systemd-run`.** Both `/etc` drop-ins landed empty
   until rewritten with `printf '%s\n' … | tee`. Use `printf|tee` for config writes in detached jobs.
5. **Gate any wlan0/host-affecting change on dose-idle.** The Wi-Fi step bounces wlan0, so it runs
   only when `restart_bridge_safe.sh --check` reports idle — same guard the bridge restart uses.

### Reusable assets this produced
- `tools/pi_harden.sh` — persistent journald + **verify-only** vendor watchdog + idle-gated Wi-Fi
  power-save disable. Idempotent; supports `ONLY=wifi`.
- `tools/pi_healthlog.sh` + `tools/systemd/pi-healthlog.{service,timer}` — 60 s health breadcrumb to
  `/home/siloos/health.log` (throttle/temp/wifi/ping/services/disk) **+ a disk-space self-heal guard**.
- `tools/systemd/siloos.logrotate` + `tools/install_healthlog.sh`.
- Full write-up: `docs/PI_HARDENING.md`.
