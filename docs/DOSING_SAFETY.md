# SiloOS — Dosing Safety & Accuracy (Maintainer Handover)

> Read this if you're taking over the project. It explains what the dosing system does, how
> the safety and accuracy logic works, how to operate/deploy/test it, and what is deliberately
> left for later. Companion to `CLAUDE.md` (agent/dev conventions) and `.agent/LESSONS.md`.

Last major work: **branch `dose-safety-accuracy`** (5 commits, see [Change log](#change-log)).
All Pi-side logic is regression-tested off-machine by `tools/dose_sim.py` (must stay green).

---

## 1. What this machine actually does

SiloOS is **repurposed Scanomat TopBrewer coffee hardware** that now **dispenses green (unroasted)
coffee beans by weight** from silos into a **single fixed hopper** sitting on a Laumas TLS485
scale. Operators dose either:

- **Direct silo dose** — pick a silo (drink) in the dashboard, set a kg target, START.
- **Custom blend / RUN SEQUENCE** — a saved recipe of several silo steps (e.g. Brazil 54.8 kg +
  Nicaragua 45.3 kg) dispensed one after another into the same hopper.

Typical dose is **several kg to tens of kg**; **±100 g accuracy is acceptable**. The dominant
hazard is **overflow**: if a dose overruns, beans spill out of the hopper onto the machine/floor.
There is **no burn risk** — the "hot liquid"/"brew" wording left in the code is a legacy of the
coffee origin and does **not** reflect current use.

Key physical facts (confirmed on hardware):
- **Scale reads kg**, empty hopper ≈ 0. Frame value is `raw / 10` (see §5).
- **Hopper capacity ≈ 130 kg** — this is both the overflow cap and the max legitimate request.

---

## 2. Architecture

```
 Dashboard (React/TS, tablet browser)                 Raspberry Pi 4 "SiloOS"
 ┌───────────────────────────────┐   WebSocket :8765  ┌──────────────────────────────────┐
 │ SiloManager (WS client)        │◄──────────────────►│ ble_bridge.py  (aiohttp relay)     │
 │  ├ DrinkCustomizer (direct)    │                    │  ├ WebSocket relay + audit log      │
 │  ├ RecipesPanel/RecipeRunner   │                    │  ├ Laumas scale reader (RS485/Modbus)│
 │  │   (blends)                  │                    │  ├ TopBrewer BLE client (bleak)     │
 │  └ PiDoseProxy (event adapter) │                    │  └ PiDoseController (dose_controller.py)
 │  BrewMonitor / ScaleReadout    │                    │        ← THE gravimetric control loop │
 └───────────────────────────────┘                    └──────────────────────────────────┘
                                                          │ BLE (SFWU)      │ RS485
                                                     TopBrewer machine   Laumas scale
```

- **The dosing control loop runs on the Pi**, in `dose_controller.py` (`PiDoseController`). It has
  the direct scale feed and the direct BLE cancel, so it keeps working even if a tablet disconnects.
  The browser only *proxies* via `PiDoseProxy` — there is **no** browser-side control loop
  (`dashboard/src/features/dosing/DoseController.ts` is now a **types-only** module; the old
  browser engine was dead code and was removed).
- Reach the Pi by **`siloos.local`** (never a hardcoded IP), **Wi-Fi only** (see `CLAUDE.md`).

### WebSocket dose protocol (client ↔ Pi)
| Direction | Message | Meaning |
|-----------|---------|---------|
| client→Pi | `dose_request {siloId, targetKg}` | ask to dose; Pi tares + arms a controller **or** rejects |
| Pi→client | `dose_ack {siloId, tareG, targetKg}` | accepted & armed — **only now may the client dispense** |
| Pi→client | `dose_rejected {siloId, reason}` | refused (hopper too full / target out of range / busy) |
| client→Pi | `dose_started {siloId}` | client has sent the machine order → Pi starts the stop timer |
| Pi→client | `dose_update {siloId, state, dispensedKg, …}` | live progress; `state:'done'` carries `result` |
| client→Pi | `dose_abort {siloId, reason}` | user/emergency abort |
| Pi→client | `dose_error {siloId, error}` | cancel not confirmed / overflow guard fired |
| Pi→client | `scale_status {status:'ok'\|'stale'}` | scale feed health |

---

## 3. Dosing sequence (both direct and blend)

1. Client sends `dose_request`.
2. **Pi validates** (target range, hopper-ready) → `dose_ack` (armed, tared) or `dose_rejected`.
3. **Client MUST wait for the ack** (`SiloManager.awaitDoseAck`). On rejection it shows a message
   and **does not** send the machine order. *(This gate is the fix for the 40 kg+100 kg overflow —
   see §7.)*
4. On ack, client sends the machine order (`sendCustomOrder`) then `dose_started`.
5. Pi's `PiDoseController.start()` arms the stop logic; it stops on weight (effective target),
   settles, `_complete()`, learns, and broadcasts `done`.

Blends (`RecipeRunner`) run steps **sequentially** — each step is a full dose (steps 1..N), with a
3 s settle between steps and total-weight compensation on the last step. **Before starting**, a
blend is refused up front if `current hopper + total blend > 130 kg`.

---

## 4. Safety architecture (overflow prevention) — layered, defense-in-depth

| # | Layer | Where | What it does |
|---|-------|-------|--------------|
| 1 | Confirm dialog + target clamp | `DrinkCustomizer` | echoes exact kg target; clamps to `GRAV_MAX_KG` (120). Killed the old **200-"kg" default**. |
| 2 | Upfront blend fit-check | `RecipeRunner.start()` | refuses a blend before dispensing if `hopper + total > 130`. |
| 3 | **Ack-gating** | `SiloManager.awaitDoseAck` + both clients | never send the machine order until the Pi accepts. **Rejected dose ⇒ no dispense.** |
| 4 | Server-side target reject | `ble_bridge` dose_request | reject `targetKg ≤ 0` or `> max_target_kg` (130). |
| 5 | Hopper-ready gate | `ble_bridge` dose_request | reject if `current_weight + target > hopper_abort_kg` (130). |
| 6 | Per-dose absolute caps | `PiDoseController` | `max_weight_kg` (gross ≥ 130 → force-abort) + `max_dispense_s` wall-clock ceiling. |
| 7 | **Overflow guard** | `ble_bridge._feed_dose_controller` | cancels the machine **any time gross ≥ 130 kg, regardless of dose state** — catches an uncontrolled dispense even if the client logic fails. Cannot be bypassed by a stale tablet. |
| 8 | Scale-stale watchdog | `PiDoseController` | if no scale frame for 1.5 s during a dose → force-abort (feed died = flying blind). |
| 9 | Reliable cancel | `PiDoseController._do_cancel` + `run_topbrewer_client` | cancel targets the *live* BLE client; re-issues STOP on reconnect; a failed cancel is surfaced (`dose_error`), not silently treated as "stopped". |
| 10 | Fail-loud UX | `App`, `BrewMonitor`, `DashboardScreen` | offline banner + reactive LED; live-dose "signal lost" watchdog + big red STOP; E-STOP stays live during a Pi-authority dose. |

**Tunable limits** live in `config.json` → `safety` block:
```json
"safety": {
  "hopper_abort_kg": 130.0,   // gross overflow cap (guard + gate + per-dose cap)
  "max_target_kg": 130.0,     // reject any single request above this
  "max_dispense_s": 600.0,    // absolute per-dose wall-clock ceiling
  "enforce_scale_crc": true   // drop Modbus frames that fail CRC16
}
```
If absent, `ble_bridge.py` uses these same values as defaults. The dashboard mirrors the 130 kg
cap as `GRAV_MAX_KG` / `RecipeRunner.HOPPER_CAP_KG` — **keep them in sync** if you change the hopper.

---

## 5. Scale signal (Laumas TLS485 over RS485/Modbus)

- The transmitter **streams** Modbus "read holding registers" responses continuously; the bridge
  only listens (never sends a request). Frame: `01 03 0A <5×uint16 BE> <CRC16-lo CRC16-hi>` (15 bytes).
- Weight = **register R4** (`buffer[i+11..12]`) `/ SCALE_DIVISOR (10)` = **kg**. Confirmed via
  `tools/scale_registers.py` (a stable 46.2 kg read; other registers duplicate/zero; 16-bit, no
  32-bit truncation in range).
- **CRC16 enforced** (`safety.enforce_scale_crc`, standard Modbus RTU, poly 0xA001) — 0/8 bad
  frames in the live dump. Plus a range-check (reject > 300 kg) and a **median debounce** in the
  controller so a single spike frame can't trip the stop.
- If the transmitter framing ever changes and every frame starts failing CRC, weight will stop —
  set `enforce_scale_crc:false` and re-check with `tools/scale_registers.py`.

---

## 6. Accuracy / learning (per-silo, self-tuning)

`PiDoseController` learns a profile per silo, persisted in `silo_profiles.json`:
- `flow_rate_kg_per_s` — EMA, used for the backstop timer + display.
- `overshoot_kg` — **the primary control quantity**: an *integral controller on net output error*
  (`overshoot_kg += alpha·(actual − target)`). `effective_target = target − overshoot_kg`; the dose
  stops at the effective target and the valve coast-down lands it on target. This replaced a biased
  `actual/total_duration` estimate that never converged and oscillated — see the sim's `convergence`
  scenario (lands within ±20 g of a 2 kg target).
- Graduated EMA alpha (1.0 → 0.2 as `total_doses` grows); P4 step-change flow detection.

**Profiles are keyed by silo/drink NAME and shared** between direct doses (`drink.name`) and blend
steps (`step.menuName`). So **RUN SEQUENCE / custom blends are fully inside the learning &
precision system** — each completed blend step improves that silo's profile, and direct + blend
doses reinforce each other. **Only *completed* doses learn** — `_learn()` is called solely from
`_complete()`, never from an abort / rejection / overflow-guard cancel, so those never corrupt a
profile.

---

## 7. Two latent bugs found & fixed during this work (root causes of past incidents)

1. **Duplicate bridge services.** `scale_bridge.service` **and** `silo-bridge.service` were both
   enabled and ran the same `ble_bridge.py`; they fought over port `:8765` every boot — whichever
   bound first won, the other crash-looped with `Errno 98`. This was a root cause of recurring
   "not connecting" incidents. **Fix: `silo-bridge` disabled; `scale_bridge` is the single
   canonical service.** Never enable both. If `scale_bridge` shows `activating`/crash-loop, check
   `sudo ss -ltnp | grep :8765` for a rogue holder.
2. **`where` vs `which`.** `run_topbrewer_client` called `subprocess.run(["where","bluetoothctl"])`
   — `where` is Windows-only; on the Pi it threw every 4 s and the machine **never connected**.
   Fixed to `shutil.which`.
3. **Toothless overflow gate (the reported 40 kg + 100 kg overfill).** The Pi gate *did* reject
   over-cap doses, but the clients sent the machine order **without waiting for the ack**, so a
   rejected dose still dispensed uncontrolled (no weight cutoff). Fixed by ack-gating (§4 #3) +
   the bridge overflow guard (§4 #7) as an un-bypassable backstop.

---

## 8. Services & operations (on the Pi)

Two enabled systemd units (both `Restart=always`):
- `scale_bridge.service` → `python3 /home/siloos/ble_bridge.py` (WebSocket `:8765`, scale, BLE).
- `silo-dashboard.service` → `npm run dev -- --host --port 5173` (Vite dev server, `:5173`).
- `silo-bridge.service` — **disabled duplicate, do not re-enable.**

```bash
# status / logs
ssh -i ./siloos_key siloos@siloos.local "systemctl status scale_bridge silo-dashboard --no-pager"
ssh -i ./siloos_key siloos@siloos.local "sudo journalctl -u scale_bridge -n 50 --no-pager"

# structured audit log of every dose/rejection/overflow:
ssh -i ./siloos_key siloos@siloos.local "tail -f /home/siloos/logs/dispensing.log"
```

Dashboard: **http://siloos.local:5173/** (any device on the Wi-Fi). It's a Vite **dev** server, so
after deploying frontend files the browser must be **reloaded** to pick up new code.

---

## 9. Deploy & rollback

**Backend (`ble_bridge.py`, `dose_controller.py`)** — restarting the bridge is a hard-to-reverse
action on live equipment; back up first:
```bash
ssh -i ./siloos_key siloos@siloos.local "cd /home/siloos && cp -a ble_bridge.py ble_bridge.py.bak.$(date +%F-%H%M%S) && cp -a dose_controller.py dose_controller.py.bak.$(date +%F-%H%M%S)"
scp -i ./siloos_key ble_bridge.py dose_controller.py siloos@siloos.local:/home/siloos/
scp -i ./siloos_key tools/dose_sim.py tools/scale_registers.py siloos@siloos.local:/home/siloos/tools/
ssh -i ./siloos_key siloos@siloos.local "cd /home/siloos && python3 -m py_compile ble_bridge.py dose_controller.py && sudo systemctl restart scale_bridge"
# verify: is-active, NRestarts=0, 'Connected to SiloSystem via BLE', port :8765 bound dual-stack
```

**Frontend (`dashboard/src/**`)** — Vite dev picks up files on disk; **typecheck** before relying on it:
```bash
scp -i ./siloos_key <changed files> siloos@siloos.local:/home/siloos/dashboard/<same path>
ssh -i ./siloos_key siloos@siloos.local "cd /home/siloos/dashboard && npx tsc --noEmit -p tsconfig.json && sudo systemctl restart silo-dashboard"
# then RELOAD every tablet browser
```

**Rollback**: restore the `.bak.*` files on the Pi and restart the service; in git, `git checkout
master` (this work lives on branch `dose-safety-accuracy`).

**Diagnostic tool (read-only):** `tools/scale_registers.py` needs the serial port, so stop the
bridge first: `sudo systemctl stop scale_bridge && python3 tools/scale_registers.py; sudo systemctl start scale_bridge`.

---

## 10. Test checklist (safe → live)

Safe (no dispensing): stop the bridge → dashboard shows red offline banner + reactive LED + a drink
opens to error/retry (not an infinite "Zeroing Scale…"); E-STOP greys correctly.

With a catch tray under the hopper:
- **Overflow (direct):** hopper near full, request a target that would exceed 130 kg → **rejected**,
  no dispense.
- **Overflow (blend):** hopper partly full, RUN SEQUENCE a blend whose total won't fit → **yellow
  "won't fit" banner**, buttons stay usable (no grey-lock/reload).
- **Normal dose / blend:** fits → dispenses and stops on target; over ~5 repeats a silo converges to
  within ±100 g.
- **BLE drop mid-dose:** disable machine BT briefly → on reconnect the Pi commands STOP; BrewMonitor
  shows "SIGNAL LOST — CLOSING VALVE".
- **Scale-stale:** pull RS485 mid-dose → dose auto-cancels (`scale_stale`).
- **Overflow guard:** (carefully) confirm gross reaching 130 kg cancels the machine regardless of
  dose state (audit event `overflow_guard`).

Off-machine regression (run after any `dose_controller.py` change): `python3 tools/dose_sim.py`
(9/9 scenarios incl. convergence must pass).

---

## 11. Change log (branch `dose-safety-accuracy`)

| Commit | Summary |
|--------|---------|
| `4a43c39` | Spill-safety backstops (max-weight/time, scale-stale watchdog, reliable cancel), converging integral-overshoot learning + P4 step-flow, scale CRC/range/debounce, stable tare + hopper-ready gate, fail-loud UX, retire dead TS DoseController, `tools/dose_sim.py` + `tools/scale_registers.py`. |
| `661810f` | `shutil.which` for bluetoothctl (`where` broke TopBrewer connect on the Pi). |
| `b9c786c` | **Gate hardware dispense on `dose_ack`** (rejected doses no longer overflow) + **bridge overflow guard**; enable CRC16 enforcement; ScaleReadout kg label; consolidate to single `scale_bridge`. |
| `00fb5e3` | Upfront whole-blend hopper-fit check in `RecipeRunner`. |
| `f7b2e01` | Show reason + don't lock the UI when a sequence is refused. |

---

## 12. Deferred / known caveats (next maintainer TODO)

- **Multi-device (Phase 4):** per-drink prefs are global and broadcast (two tablets editing the same
  drink stomp each other live); active doses are keyed by drink **name**, not a unique order id, so
  concurrent orders of the same drink can cross-wire feedback/inventory. Recommend: keep
  customization local until saved; key doses by a unique order/session id end-to-end.
- **Phase 5 polish:** auto-top-up briefly flashes "Complete" between top-ups (show "Topping up N of
  M"); `ScaleLoadingScreen`'s "Stability Confirmed" is a hardcoded 1.5 s timer, not a real
  stability measurement.
- **Unit display:** direct/blend/inventory panels historically showed the same weight as g / kg-1dp
  / kg-2dp / kg-3dp. ScaleReadout is now kg; a single shared `formatWeight` util across all panels
  is still worth doing.
- **`config.json` hygiene:** `auth_token` is `silo-secret` (hardcoded) and the SSH key is in the
  repo — pre-existing security debt, out of scope here but worth addressing.
- **Hopper cap is duplicated** in Python (`config.json`) and TS (`GRAV_MAX_KG`,
  `RecipeRunner.HOPPER_CAP_KG`); a future improvement is to broadcast it from the Pi so there's one
  source of truth.
