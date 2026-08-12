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
| 11 | **Empty/blocked-silo watchdog** | `PiDoseController._no_flow_check` | if `< no_flow_min_kg` (0.1 kg) is dispensed within `no_flow_s` (10 s) of starting — silo empty or auger jammed — force-abort with reason `empty_or_blocked_silo` instead of silently "completing" a 0 kg dose. Shown to the operator as **"⚠ EMPTY OR BLOCKED SILO"** in `BrewMonitor`; logged as an abort (excluded from accuracy KPIs). The stall stop is gated to *after* flow begins so it can't pre-empt this. |

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
- `overshoot_kg` — **the primary control quantity**: the coast-down material that keeps falling
  AFTER the valve closes. `effective_target = target − overshoot_kg`; the dose stops at the
  effective target and the coast-down lands it on target. Learned by feedback on the net output
  error: `overshoot_kg += alpha · (actual − target)`. (This replaced a biased
  `actual/total_duration` estimate that never converged.)

**Adaptive-gain learner (current).** The gain adapts to the error magnitude so the loop converges
fast AND then holds. The old flat `alpha = 0.2` corrected only a fifth of the error per (~45 s)
dose, so a matured-but-mis-seeded profile crawled for ~10 doses and **read to operators as a
constant, un-improving offset**. Now:
- **Deadband** `learn_deadband_kg` (0.1 kg = one scale quantum): within it the dose is on target and
  can't be measured finer, so `overshoot_kg` is **not** adjusted — this stops the loop hunting on
  quantization/coast noise.
- **Magnitude gain**: `|error| > 0.3 kg → 0.7`, else `0.5` (both floored by the young-profile
  schedule 1.0 → 0.2). A bad seed or a perturbation recovers to spec in ~2–3 doses (sim
  `bad_seed_recovery`) instead of ~10.
- **Small-dose guard** `min_learn_kg` (1.0 kg): doses below this are **uncontrollable** (the coast
  alone exceeds the target, so `effective_target` floors) and are **excluded from learning**. This
  kills a live-observed poison — a single 0.5 kg auto-top-up hit the `0.9·target` clamp (0.45) and
  slammed 4 Robusta's learned `overshoot_kg` from **1.72 → 0.45**, causing +0.7 kg overshoots on the
  next 30 kg doses (sim `tiny_dose_no_poison`).

**Profiles are keyed by silo/drink NAME and shared** between direct doses (`drink.name`) and blend
steps (`step.menuName`) — RUN SEQUENCE / custom blends are fully inside the learning system, and
direct + blend doses reinforce each other. **Only *completed* doses learn** (`_learn()` runs solely
from `_complete()`), so aborts / rejections / overflow-guard / empty-silo cancels never corrupt a
profile.

**Re-seeding a bad profile.** `overshoot_kg` ≈ the true coast, which you can read straight off the
audit log: `coast = overshoot_used + error` per `pi_dose_complete`. To fix a badly-off profile, edit
`silo_profiles.json` on the Pi (back it up first; **no restart needed** — it's re-read at each
dose's arm). ⚠️ **Only while idle:** a controller loads its profile at arm-time and `save_profile()`
at completion rewrites the whole silo entry, so an edit made *during* an in-flight dose is clobbered
when that dose completes. (Done live on 2026-08-12: Brazil→1.0, Robusta→1.2, Ethiopia 0.0→1.0.)

**Tunable control constants** each default to their original value but can be overridden per
deployment in `config.json → control` (the bridge passes them through): `no_flow_s`,
`no_flow_min_kg`, `min_learn_kg`, `learn_deadband_kg`, plus `settle_s`, `stall_time_s`, `stall_kg`,
`scale_stale_s`, `debounce`, `backstop_mult`. The `config.json → safety` caps stay authoritative.

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
scp -i ./siloos_key tools/dose_sim.py tools/scale_registers.py tools/restart_bridge_safe.sh siloos@siloos.local:/home/siloos/tools/
# NEVER `systemctl restart scale_bridge` directly — restarting mid-dose severs the
# control loop and the hopper overflows. Always go through the guarded restart,
# which refuses while a dose is armed/running:
ssh -i ./siloos_key siloos@siloos.local "cd /home/siloos && python3 -m py_compile ble_bridge.py dose_controller.py && sudo bash tools/restart_bridge_safe.sh --wait 60"
#   --wait 60 : if a dose is live, poll up to 60 s for it to finish, then restart.
#   plain (no flags) skips with exit 3 if a dose is active; --force overrides (risky).
#   check only: ssh ... "bash tools/restart_bridge_safe.sh --check"  (0 idle, 3 active)
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
- **Empty/blocked silo:** START a dose on an empty (or closed) silo → within 10 s it auto-aborts,
  `BrewMonitor` shows **"⚠ EMPTY OR BLOCKED SILO"** (audit `pi_empty_silo`), and it's logged as an
  abort — not a silent 0 kg dose.

Off-machine regression (run after any `dose_controller.py` change): `python3 tools/dose_sim.py` —
**all must pass**: 9 scenarios (incl. `empty_silo`) + 3 learning tests (`convergence`,
`bad_seed_recovery`, `tiny_dose_no_poison`).

---

## 11. Change log (branch `dose-safety-accuracy`)

| Commit | Summary |
|--------|---------|
| `4a43c39` | Spill-safety backstops (max-weight/time, scale-stale watchdog, reliable cancel), converging integral-overshoot learning + P4 step-flow, scale CRC/range/debounce, stable tare + hopper-ready gate, fail-loud UX, retire dead TS DoseController, `tools/dose_sim.py` + `tools/scale_registers.py`. |
| `661810f` | `shutil.which` for bluetoothctl (`where` broke TopBrewer connect on the Pi). |
| `b9c786c` | **Gate hardware dispense on `dose_ack`** (rejected doses no longer overflow) + **bridge overflow guard**; enable CRC16 enforcement; ScaleReadout kg label; consolidate to single `scale_bridge`. |
| `00fb5e3` | Upfront whole-blend hopper-fit check in `RecipeRunner`. |
| `f7b2e01` | Show reason + don't lock the UI when a sequence is refused. |
| `feat/amokka-console` | **Empty/blocked-silo watchdog** (10 s no-flow → `empty_or_blocked_silo` abort + `BrewMonitor` "⚠ EMPTY OR BLOCKED SILO" copy). **Adaptive-gain learner**: magnitude-based gain + 0.1 kg deadband + skip `<1 kg`/top-up doses — fixes the slow "constant offset" convergence and the tiny-dose profile poisoning (0.5 kg dose was resetting `overshoot_kg` via the `0.9·target` clamp). Live profile re-seed (Brazil 1.0 / Robusta 1.2 / Ethiopia 1.0). New control overrides (`no_flow_s`, `no_flow_min_kg`, `min_learn_kg`, `learn_deadband_kg`). Sim +`empty_silo` / `bad_seed_recovery` / `tiny_dose_no_poison`. |

---

## 12. Phase 4/5 + security (DONE) and remaining caveats

**Done (branch `phase4-5-security`):**
- **Multi-device (Phase 4):** doses now carry a unique **`orderId`** (client → `dose_request`; Pi
  echoes it on ack/update/rejected/error) so two tablets ordering the same silo don't cross-wire —
  profile learning still keys on silo name. Customization is **local-until-saved**: no live
  broadcast on every slider move, no live-apply of other clients' edits; prefs persist on brew.
- **Phase 5 polish:** shared `utils/formatWeight` (`formatKg`/`kgValue`, 1-dp default = honest 0.1 kg
  resolution) applied to the panels; BrewMonitor shows **"Topping up N of M"**; the loading screen's
  "Stability Confirmed" is now a **real** poll-until-steady gate (max-wait fallback), not a 1.5 s timer.
- **Security:** `config.json` and `siloos_key`/`.pub` are **untracked** (git rm --cached; files stay
  on disk) and gitignored; `config.example.json` added; the bridge reads the auth token from
  **`SILOOS_AUTH_TOKEN` env** first, then `config.json`, then the `silo-secret` dev default — so a
  strong token can be injected without committing it.

**Still open (manual / operational):**
- **Rotate the SSH key** — `siloos_key` remains in git **history** and on `origin` (GitHub). Full
  remediation: generate a new keypair, add the new pubkey to the Pi's `~/.ssh/authorized_keys`,
  swap the local key, remove the old key from the Pi, and consider a history rewrite. Not automated
  here (CLAUDE.md forbids modifying `siloos_key`, and to avoid lockout).
- **Rotate the auth-token VALUE** — the mechanism is in place but the running token may still be
  `silo-secret`. To rotate: set a strong token in the Pi's `config.json` `auth_token` (or
  `SILOOS_AUTH_TOKEN` in the `scale_bridge` unit) **and** `VITE_WS_AUTH_TOKEN=<same>` in
  `dashboard/.env`, restart both services, then **reload every tablet** (they 401 with the old token
  until reloaded). Roll back to `silo-secret` if a client can't reconnect.
- **Hopper cap duplicated** in Python (`config.json`) and TS (`GRAV_MAX_KG`,
  `RecipeRunner.HOPPER_CAP_KG`); consider broadcasting it from the Pi for one source of truth.
