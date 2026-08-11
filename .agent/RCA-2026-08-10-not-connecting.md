# Root Cause Analysis — "SiloOS not connecting" (2026-08-10)

## Summary
The dashboard could not connect to the Pi bridge. Investigation found **six distinct problems** stacked on top of each other — not one bug. Two headline causes: (1) **the `scale_bridge` systemd service did not exist** on the current Pi, so the bridge never started; and (2) **a dead ethernet link became the preferred IPv4 route and black-holed all IPv4 traffic**. Everything else (Wi-Fi power-save flapping, IP drift, a rogue laptop mock, IPv4-only dashboard binding) compounded it and sent earlier troubleshooting down the wrong path.

## RESOLUTION (confirmed working 2026-08-10 ~12:12)
`http://siloos.local:5173/` returns **HTTP 200 on 8/8 requests over Wi-Fi**, IPv4 and IPv6. `siloos.local` resolves to the working Wi-Fi IP `10.0.124.199`. Actions taken:
1. Installed + enabled `scale_bridge.service` (`Restart=always`) — bridge now serves `0.0.0.0:8765` + `[::]:8765` and auto-starts on boot.
2. Created + enabled `silo-dashboard.service` running `vite --host --port 5173` — dual-stack `*:5173`, auto-starts on boot. (Originally set `--host 0.0.0.0` which was IPv4-only and missed the IPv6 mDNS clients — corrected to `--host`.)
3. Disabled Wi-Fi power-save (persistent: systemd unit + `nmcli ... powersave 2`) — this was the connection "flapping."
4. **Took `eth0` down (`nmcli` autoconnect off).** eth0 had a live IP (`10.0.124.5`) and was the *preferred* IPv4 route (metric 100) but was a **dead link — 100% packet loss to the gateway** — so all IPv4 black-holed. wlan0 (metric 600) was healthy the whole time. With eth0 out, Wi-Fi is the sole path and IPv4 works.
5. Killed the rogue laptop mock; switched repo tooling to `siloos.local`; opened Vite `allowedHosts`.

**Action still needed from the operator:** physically **unplug the dead ethernet cable** (the eth0 software-disable may not survive a `netplan apply`/reboot). And set a **router DHCP reservation** for wlan0 MAC `dc:a6:32:34:44:27` so the Wi-Fi IP stops drifting (helps non-mDNS devices like some Android browsers).

## Timeline of the investigation
1. `siloos.local` resolved to `10.0.124.120` — but that is **this Windows laptop's own IP**, not the Pi.
2. A rogue `tools/mdns_publisher.py` on the laptop was advertising `siloos.local` → the laptop, and a local `ble_bridge.py` mock was listening on `:8765` with no real hardware. Both were leftovers from a prior session. **Killed** (user-authorized).
3. Repo had the Pi's address hardcoded to `10.0.124.5` everywhere — a dead address at the time. **Replaced with `siloos.local`.**
4. Real Pi located by Raspberry Pi MAC OUI in ARP. After an ethernet cable was connected, SSH succeeded and revealed the true state.

## Ground truth (from SSH into the Pi)
- **Hardware**: `Raspberry Pi 4 Model B Rev 1.1`. (Docs/memory said "Pi 3B+" — **wrong**. The 3B+ is likely the stray `b8:27:eb` device at `10.0.124.125` that no longer runs SSH — an old/decommissioned unit.)
- **Hostname**: `SiloOS`.
- **Interfaces (all up at once)**:
  - `eth0  = 10.0.124.5/24`  (the wired cable — this is the intended static IP)
  - `wlan0 = 10.0.124.199/24` (Wi-Fi, DHCP — the address that keeps drifting)
  - `tailscale0 = 100.120.122.115`
- **`scale_bridge` service**: `systemctl is-enabled scale_bridge` → **`not-found`**. The unit does not exist. `is-active` → `inactive`. No journal entries.
- **Reachability**: `siloos.local` connects reliably; individual interface IPs intermittently time out; long SSH commands drop mid-stream → severe **link flapping**.

## Root causes (ranked)

### RC1 — No `scale_bridge` systemd service on this Pi *(primary)*
The service that is supposed to run `ble_bridge.py` on boot does not exist on this Pi 4. Nothing starts the bridge, so port 8765 is never served by real hardware. STATUS.md claimed the service was "enabled for boot" — that was true of the **old Pi 3B+**, but this Pi 4 was never provisioned with it (hardware was apparently swapped/migrated without reinstalling the service).
**Fix**: install + enable a `scale_bridge.service` unit with `Restart=always`. See `tools/scale_bridge.service` + `tools/install_bridge_service.sh`.

### RC2 — Dual-homed on the same subnet → ARP flux / flapping *(primary for instability)*
`eth0` (`10.0.124.5`) and `wlan0` (`10.0.124.199`) are **both on `10.0.124.0/24` at the same time**. Two interfaces on one subnet causes ARP flux and asymmetric routing on Linux: replies may leave the "wrong" interface, so a given IP answers intermittently. This is the "connects then drops" behavior.
**Fix**: use **one** interface for the LAN. Recommended: wired `eth0` static `10.0.124.5`, and disable Wi-Fi (or set a high route metric / `rp_filter`). Do not run both on the same subnet.

### RC3 — Pi IP drift + hardcoded IPs in the repo
Wi-Fi DHCP address drifted repeatedly (`.199` now, `.90`, etc.). Every doc/config hardcoded a specific IP, so each drift broke tooling, and a prior automated "fix" hardcoded the now-dead `.5`.
**Fix (done)**: tooling now uses `siloos.local`. Pin `eth0` to static `10.0.124.5` so even the raw IP is stable (`tools/set_pi_static_ip.sh`). Optionally add a router DHCP reservation for the MAC.

### RC4 — Rogue laptop mock hijacking `siloos.local`
`tools/mdns_publisher.py` (dev-only mock) advertised `siloos.local` → the laptop, and a local `ble_bridge.py` answered on `:8765`. This made the app appear to "connect" to nothing and misdirected diagnosis.
**Fix (done)**: processes killed. **Recommendation**: delete or clearly quarantine `tools/mdns_publisher.py`; never leave it running against real hardware.

### RC5 — Possible power/stability issue on the Pi *(to confirm)*
The severe flapping may be more than dual-homing — a Pi 4 under-powered by a weak USB-C supply reboots/browns out. **To check on a stable session**: `vcgencmd get_throttled` (nonzero ⇒ undervoltage), `dmesg | grep -i -E "under-voltage|throttl"`, and SD-card health.

## Prevention checklist
- [ ] Install + enable `scale_bridge.service` with `Restart=always` (RC1).
- [ ] Pick a single LAN interface; disable Wi-Fi or move it off the `/24` (RC2).
- [ ] Pin `eth0` static `10.0.124.5` and/or add a DHCP reservation (RC3).
- [ ] Delete/quarantine `tools/mdns_publisher.py`; document it as laptop-only mock (RC4).
- [ ] Check `vcgencmd get_throttled` for undervoltage; use a proper 3A+ USB-C supply (RC5).
- [ ] Remove/retire the stray old Pi 3B+ (`10.0.124.125`) or confirm it's off the network.
- [ ] Correct docs: hardware is **Pi 4 Model B**, not 3B+.
- [ ] Add a dashboard "bridge offline" banner so this fails loudly, not silently (existing ISS-006).

## Reusable assets created
- Skill: `.agent/skills/siloos-pi-recovery/SKILL.md` — full diagnostic + recovery procedure.
- `tools/set_pi_static_ip.sh` — sets static `10.0.124.5` (NetworkManager or dhcpcd).
- `tools/scale_bridge.service` + `tools/install_bridge_service.sh` — install/enable the bridge as an auto-restarting service.
