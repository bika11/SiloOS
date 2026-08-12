# SiloOS - Claude Code Project Configuration

## Project Overview
SiloOS is a BLE gateway system connecting a Scanomat TopBrewer coffee machine to a Laumas TLS485 scale via a Raspberry Pi 4 (hostname `SiloOS`), with a React PWA dashboard.

## Architecture
- **Backend**: Python 3 async (aiohttp/bleak) on Raspberry Pi
- **Frontend**: React 19 + TypeScript 5.9 + Vite 7.2 in `dashboard/`
- **Protocol**: SFWU binary protocol with CRC32-CCITT checksums
- **Communication**: WebSocket relay (ws://siloos.local:8765) + BLE GATT + RS485 serial

## Key Paths
- `ble_bridge.py` — Main Python bridge (runs on Pi)
- `config.json` — Runtime configuration (MAC, port, auth token)
- `dashboard/src/` — React PWA source
- `dashboard/src/bluetooth/` — BLE communication layer
- `dashboard/src/sfwu/` — SFWU protocol implementation
- `dashboard/src/features/` — UI screens/components
- `.agent/` — Multi-agent collaboration system

## Rules
- NEVER modify `siloos_key` or `siloos_key.pub`
- ALWAYS run TypeScript strict mode checks after frontend changes
- When modifying `ble_bridge.py`, trigger the sync-project workflow
- When modifying SFWU parsers, update ONLY `src/sfwu/parsers/` (NOT `src/sfwu/responses/`)
- Keep the WebSocket API contract stable — changes require updating both Python bridge and TypeScript client
- Pin all new Python dependencies in `requirements.txt`
- Use `.env` files for secrets, never hardcode tokens

## Operational Rules & Gotchas (hard-won — see `.agent/LESSONS.md`)
- **Reach the Pi by `siloos.local`, never a hardcoded IP.** The Wi-Fi IP is DHCP and drifts. Raw IPs in configs have broken this repeatedly; the dashboard's own WebSocket is derived from `window.location.hostname` on purpose — keep it that way.
- **Wi-Fi ONLY. Keep the ethernet cable unplugged.** `eth0` is a dead link (no gateway) but installs itself as the *preferred* IPv4 route and black-holes all IPv4 when connected. Working interface is `wlan0`.
- **Two systemd services run the stack**, both `Restart=always` + enabled on boot: `scale_bridge` (bridge, `:8765`) and `silo-dashboard` (Vite, `:5173`). Don't run either by hand as the "production" instance.
- **ONE bridge service only: `scale_bridge`.** A duplicate unit `silo-bridge.service` (same `ExecStart=python3 /home/siloos/ble_bridge.py`) was also enabled and both fought over port `:8765` at every boot — whichever bound first won, the other crash-looped with `Errno 98`. This was a root cause of the recurring "not connecting" incidents. `silo-bridge` is now disabled; **never enable both.** If `scale_bridge` shows `activating`/crash-loop, check `sudo ss -ltnp | grep :8765` for a rogue holder.
- **`ble_bridge.py` must use Linux commands** — a stray `subprocess.run(["where", …])` (Windows-only) once threw every 4 s and stopped the TopBrewer from ever connecting. Use `shutil.which`.
- **Serve the dashboard dual-stack: `vite --host` (NOT `--host 0.0.0.0`).** `siloos.local` has an IPv6 record; IPv4-only binding silently fails for IPv6 clients.
- **Before trusting a "connection", kill any laptop-side mock.** A leftover local `ble_bridge.py` and `tools/mdns_publisher.py` can hijack `siloos.local` → the laptop and fake a bridge. `mdns_publisher.py` is a dev-only mock — never leave it running.
- **On a flaky Pi link, don't hand-run multi-step commands** — push a script and launch it detached (`sudo systemd-run --unit=… --collect bash script.sh`), then poll its log. Diagnostic + fix scripts live in `tools/`.
- When "not connecting", start with the `siloos-pi-recovery` skill and `.agent/RCA-2026-08-10-not-connecting.md`.

## Dosing Safety Architecture (green-coffee bean dispensing)
> **Full maintainer handover: [`docs/DOSING_SAFETY.md`](docs/DOSING_SAFETY.md)** — read that first if
> you're new to the project (architecture, safety layers, learning, deploy/rollback, test checklist,
> change log, deferred work).

This is repurposed coffee hardware that now dispenses **green coffee beans by weight** into a
**fixed hopper** (~kg doses; ±100 g acceptable). Overrun = beans overflow onto the machine/floor.
The gravimetric control loop lives on the Pi in `dose_controller.py` (`PiDoseController`) — the
browser only proxies via `PiDoseProxy`. Key invariants:
- **Weight unit is kg.** Scale frame `raw / SCALE_DIVISOR (10)` = kg; empty hopper reads ~0. The
  `1 App Unit = 1 kg` convention in `DrinkCustomizer` is intentional. Modbus **CRC16 is enforced**
  (`safety.enforce_scale_crc`), plus range-check + median debounce on the cutoff sample.
- **Clients MUST wait for `dose_ack` before sending the hardware order.** `dose_request` → the Pi
  either `dose_ack` (armed, tared) or `dose_rejected` (hopper too full / target out of range / busy).
  Sending `sendCustomOrder` before the ack means a *rejected* dose still dispenses uncontrolled and
  overflows. Both `RecipeRunner` and `DrinkCustomizer` gate on `siloManager.awaitDoseAck(siloId)`.
- **Layered overflow protection**: server-side target reject (>`safety.max_target_kg`, 130 kg) +
  hopper-ready gate (`current_weight + target > hopper_abort_kg`) + per-dose absolute caps
  (`max_weight_kg` gross, `max_dispense_s`) + a bridge-level **overflow guard** that cancels the
  machine any time gross weight ≥ 130 kg regardless of dose state + a scale-stale watchdog +
  an **empty/blocked-silo watchdog** (`< 0.1 kg` in 10 s → `empty_or_blocked_silo` abort, not a
  silent 0 kg dose).
- **Accuracy learner** (`dose_controller.py` `_learn`): per-silo `overshoot_kg` (the coast-down)
  with **adaptive gain + 0.1 kg deadband**, and doses `< 1 kg` (top-ups) are **excluded from
  learning** (a tiny dose's `0.9·target` clamp otherwise wrecks the calibration). Re-seed a bad
  profile by editing `silo_profiles.json` on the Pi **while idle** (see `docs/DOSING_SAFETY.md` §6).
- **Tune limits in `config.json` → `safety` block**: `hopper_abort_kg`, `max_target_kg`,
  `max_dispense_s`, `enforce_scale_crc`. Control constants (incl. `no_flow_s`, `min_learn_kg`,
  `learn_deadband_kg`) are overridable in `config.json` → `control`.
- **Off-machine regression suite**: `python3 tools/dose_sim.py` (must stay green after any
  `dose_controller.py` change — 9 scenarios + 3 learning tests). `tools/scale_registers.py` =
  read-only Laumas register dump.

## Agent System
This project uses a multi-agent collaboration framework in `.agent/`.
- Read `.agent/ORCHESTRATOR.md` for the full system overview
- Read `.agent/STATUS.md` for current project status
- Read `.agent/TASKS.md` for the prioritized task board
- Skills are in `.agent/skills/`, workflows in `.agent/workflows/`

## Commands
```bash
# Dashboard dev server
cd dashboard && npm run dev -- --host

# Build dashboard
cd dashboard && npm run build

# Lint
cd dashboard && npm run lint

# Pi bridge (on Raspberry Pi)
python3 ble_bridge.py

# Sync to Pi (GUARDED restart — never restart scale_bridge mid-dose; the hopper overflows)
scp -i ./siloos_key ./ble_bridge.py ./dose_controller.py siloos@siloos.local:/home/siloos/
scp -i ./siloos_key ./tools/restart_bridge_safe.sh siloos@siloos.local:/home/siloos/tools/
ssh -i ./siloos_key siloos@siloos.local "sudo bash /home/siloos/tools/restart_bridge_safe.sh --wait 60"
#   guard refuses while a dose is armed/running; --check = report only (0 idle/3 active), --force = override

# Service management on the Pi (both are enabled + Restart=always)
ssh -i ./siloos_key siloos@siloos.local "systemctl status scale_bridge silo-dashboard --no-pager"
ssh -i ./siloos_key siloos@siloos.local "sudo journalctl -u silo-dashboard -n 30 --no-pager"

# If the Pi link is flaky, run work detached so it survives SSH drops:
#   scp tools/<script>.sh siloos@siloos.local:/home/siloos/
#   ssh siloos@siloos.local "sudo systemd-run --unit=job --collect bash /home/siloos/<script>.sh"
#   then poll the script's log file.
```

Access the dashboard at **http://siloos.local:5173/** (works for any device on the Wi-Fi).
