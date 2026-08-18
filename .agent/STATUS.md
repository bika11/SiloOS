# SiloOS Project Status & Monitoring

## System Health Dashboard

> ✅ **2026-08-10 12:12: Dashboard restored over Wi-Fi.** `http://siloos.local:5173/` = HTTP 200, 8/8 stable. Pi (Raspberry Pi 4, hostname `SiloOS`) runs on Wi-Fi `wlan0 = 10.0.124.199` (eth0 disabled — it was a dead link). Bridge + dashboard are systemd services with `Restart=always`, enabled on boot. See Latest Updates + RCA.

| Component | Status | Last Verified | Notes |
|-----------|--------|---------------|-------|
| **Dashboard PWA** | ✅ OPERATIONAL | 2026-08-10 | `silo-dashboard.service` (Vite `--host`, dual-stack `*:5173`), auto-start, 200 over Wi-Fi |
| **Python Bridge** | ✅ OPERATIONAL | 2026-08-10 | `scale_bridge.service` installed + enabled + `Restart=always`, serving `:8765` |
| **WebSocket Relay** | ✅ OPERATIONAL | 2026-08-10 | `0.0.0.0:8765` + `[::]:8765`; returns 401 to unauthenticated GET (healthy) |
| **BLE Connection** | ❓ VERIFY | 2026-08-10 | Bridge up; confirm TopBrewer link via dashboard/journal |
| **Scale (RS485)** | ❓ VERIFY | 2026-08-10 | Bridge up; confirm weight stream via dashboard |
| **Network / Wi-Fi** | ✅ OPERATIONAL | 2026-08-10 | Wi-Fi only (eth0 dead link disabled); power-save off; `siloos.local` → `10.0.124.199` |
| **SFWU Protocol** | ✅ FIXED | 2026-02-12 | Relay address corrected (0x03→0x02) |
| **Build Pipeline** | ⚠️ NEEDS REVIEW | 2026-02-12 | Vite builds, HMR IP hardcoded |
| **Gravimetric Dosing** | ✅ VERIFIED | 2026-02-18 | Weight polling, calculated cups, profile corruption protection |
| **Cup Selection** | ✅ IMPLEMENTED | 2026-02-18 | Carafe-capable drinks show 1-5 cup selector |
| **Order Scaling** | ✅ IMPLEMENTED | 2026-02-18 | Only modified ingredients sent; CUP_SIZE triggers proportional scaling |

## Architecture Diagram

```
Browser (PWA)  ──WebSocket──▶  Raspberry Pi  ──BLE──▶  TopBrewer
                                    │
                                    ├──RS485──▶  Laumas Scale
                                    │
                                    └──BLE Server──▶  Bookoo Scale (emulated)
```

## Known Issues

### Critical
| ID | Issue | Impact | Owner | Status |
|----|-------|--------|-------|--------|
| ISS-000 | **SFWU relay address wrong (0x03 instead of 0x02)** | **All commands rejected by machine** | protocol | ✅ FIXED |
| ISS-001 | Duplicate SFWU parsers in `responses/` and `parsers/` | Code confusion, maintenance risk | protocol | Open |
| ISS-002 | SSH private key committed to repo | Security vulnerability | qa | Open |
| ISS-003 | Auth token hardcoded as `silo-secret` | Security vulnerability | hardware | ✅ FIXED |

### High
| ID | Issue | Impact | Owner |
|----|-------|--------|-------|
| ISS-004 | ~~Vite HMR hardcoded to a raw IP~~ | Dev server breaks on IP change | frontend | ✅ FIXED (2026-08-10, switched to `siloos.local` mDNS) |
| ISS-005 | Python deps not version-pinned | Reproducibility risk | hardware |
| ISS-006 | No user feedback when bridge offline | Poor UX, silent failures | frontend |

### Medium
| ID | Issue | Impact | Owner |
|----|-------|--------|-------|
| ISS-007 | No test runner configured | No automated testing | qa |
| ISS-008 | Empty feature folders (order, settings) | Incomplete features | frontend |
| ISS-009 | Temperature data parsed but not displayed | Missing UI feature | frontend |

### Low
| ID | Issue | Impact | Owner |
|----|-------|--------|-------|
| ISS-010 | Legacy Python scripts cluttering root | Organization | hardware |
| ISS-011 | `TopBrewerConnection` not in barrel export | Inconsistent imports | frontend |
| ISS-012 | `xmlParser.ts` may be unused (legacy) | Dead code | qa |

## Code Quality Metrics

| Metric | Value | Target |
|--------|-------|--------|
| TypeScript strict mode | ✅ Enabled | Enabled |
| ESLint configured | ✅ Yes | Yes |
| Test coverage | ❌ 0% | >60% |
| Duplicate code | ❌ SFWU parsers duplicated | 0 |
| Dead code | ⚠️ 2 empty feature dirs | 0 |
| Security issues | ❌ 3 findings | 0 |
| Documentation | ✅ Good (README, HARDWARE, HANDOVER) | Complete |

## Dependency Versions

### Frontend (package.json)
| Package | Version | Status |
|---------|---------|--------|
| react | 19.2.0 | ✅ Current |
| typescript | ~5.9.3 | ✅ Current |
| vite | 7.2.4 | ✅ Current |
| fast-xml-parser | 5.3.4 | ✅ Current |

### Backend (Python - UNPINNED)
| Package | Expected | Status |
|---------|----------|--------|
| bleak | latest | ⚠️ Not pinned |
| aiohttp | latest | ⚠️ Not pinned |
| websockets | latest | ⚠️ Not pinned |
| pyserial | latest | ⚠️ Not pinned |
| dbus-next | latest | ⚠️ Not pinned |
| bluez-peripheral | latest | ⚠️ Not pinned |

## Latest Updates

### 2026-08-10 — "Not connecting" root-caused: rogue local mock + Pi services down
- **Agent**: Claude Code (troubleshooting session)
- **Reported symptom**: SiloOS dashboard would not connect.
- **Root cause (two compounding problems)**:
  1. **Rogue processes on the Windows dev laptop** (leftover from a prior agent's session) were masquerading as the Pi:
     - `ble_bridge.py` running locally (PID 31796) listening on `:8765` with NO real BLE/RS485 hardware behind it.
     - `tools/mdns_publisher.py` (PID 31796's sibling, PID 22632) broadcasting `siloos.local` → the **laptop's own IP `10.0.124.120`**, hijacking the mDNS name away from the real Pi. This is why earlier probes "found" the Pi at `.120` — that was the laptop answering to its own hijacked name.
  2. **Stale hardcoded Pi IP everywhere.** The Pi's DHCP address has drifted repeatedly (`.199` → `.90` → dead `.5`), and a prior automated edit rewrote references to the now-dead `10.0.124.5` across `vite.config.ts`, `sync-dashboard.ps1`, and ~15 docs/skill files.
- **Actual hardware state (verified)**:
  - Real Pi = **`10.0.124.125`** (identified by Raspberry Pi OUI MAC `b8:27:eb:5a:74:95` in ARP + Linux TTL=64). Answers ping.
  - On the Pi, **SSH (22) returns Connection Refused** (sshd not running) and **bridge (8765) is down**. Remote deploy/debug is blocked until console/ethernet access is restored.
  - `10.0.124.5` is completely dead (times out) — not currently assigned to anything.
- **Fixes applied**:
  - Killed both rogue laptop processes (user-authorized). Port 8765 freed locally; `siloos.local` no longer hijacked.
  - Replaced hardcoded `10.0.124.5` with `siloos.local` (mDNS) in `dashboard/vite.config.ts` (HMR host), `sync-dashboard.ps1`, and all `.agent/` docs/skills/workflows plus `CLAUDE.md`/`README.md`. The dashboard's app-level WebSocket URL (`SiloManager.ts`) was already derived from `window.location.hostname`, so it was never the break.
- **Plan / target config**: Give the Pi a **static IP `10.0.124.5`** (mask `255.255.255.0`, gateway `10.0.124.1`) so it stops drifting. Setup script prepared at `tools/set_pi_static_ip.sh`. Requires console or ethernet access to the Pi (SSH currently down). See skill `siloos-pi-recovery`.
- **Outstanding**: Restore SSH + bridge service on the Pi; apply the static IP; verify end-to-end connect. `tools/mdns_publisher.py` should be treated as a dev-only mock and NOT left running — consider deleting or clearly quarantining it.

### 2026-02-12 — CRITICAL BUG FIXED: SFWU Relay Address
- **Agent**: Protocol (Claude Code)
- **Action**: Fixed `SFWU_ADDR.RELAY` from `0x03` (SERVER) to `0x02` (RELAY)
- **Root Cause**: Address was misidentified from observed machine response packets. The machine sends TO address 0x03 for the server, but the app (acting as relay) must use FROM=0x02. Confirmed by comparing with Android reference `SFWU.java:43` and working PWA `constants.ts:33`.
- **Files Changed**: `dashboard/src/sfwu/constants.ts`, `dashboard/src/sfwu/SFWU.ts`
- **Impact**: This was the **primary reason** the project was not working. Every SFWU command sent had the wrong sender address, causing the TopBrewer to reject or misroute packets.

### 2026-02-12 — Reference App Analysis (AmokkaTB)
- **Agent**: QA (Claude Code)
- **Action**: Deep comparison of SiloOS against the original Android app and working PWA
- **Reference**: `C:\Users\anbdk\OneDrive - scanomat.dk\Desktop\AmokkaTB`
- **Findings**: Protocol implementation is 95% correct (packet structure, CRC32, commands all match). Primary bug was the relay address. Secondary concerns: brew status parser assumes more data than Android sends, no chunk retry logic.

### 2026-02-12 — Multi-Agent Collaboration System Created
- **Agent**: QA (Claude Code)
- **Action**: Built complete agent collaboration framework
- **Created**: ORCHESTRATOR.md, STATUS.md, TASKS.md, 4 agent roles, 6 skills, 5 workflows, CLAUDE.md
- **Purpose**: Enable multiple AI agents to collaborate on this project with clear roles, rules, and monitoring

### 2026-02-12 — Full Project Audit
- **Agent**: QA (Claude Code)
- **Action**: Complete codebase audit performed
- **Findings**: 13 issues identified (4 critical, 3 high, 3 medium, 3 low)
- **Files Reviewed**: All 75 project files
- **Next Steps**: Execute task board (TASKS.md), fix remaining critical issues

### 2026-02-16 — Gravimetric Learning Fix
- **Agent**: Dosing (Claude Code)
- **Action**: Fixed logic bug in `DoseController.ts`
- **Root Cause**: Learning algorithm ignored undershoots, preventing the system from reducing `valveDelay` if it was too cautious.
- **Impact**: Gravimetric selection should now converge quickly to the correct target, even if starting with a high delay estimate.

### 2026-02-18 — Gravimetric Weight Polling, Cup Selection, Order Scaling
- **Agent**: Frontend + Protocol (Claude Code)
- **Action**: Major overhaul of DrinkCustomizer and DoseController
- **Changes**:
  1. **Weight pipeline fix**: Replaced unreliable `siloManager['events']` monkey-patching with 10Hz `setInterval` polling of `siloManager.getWeight()` via `useRef` for synchronous DoseController access. Fixes React state race condition where new controllers never received weight samples.
  2. **Cup selection**: Exposed `carafe` flag from `MenuDetailsParser` to `MenuDetails` type. Added 1-5 cup selector UI (shown only for carafe-capable drinks, hidden in gravimetric mode). Cup count passed to `sendCustomOrder()`.
  3. **Order scaling**: Only user-modified ingredients sent in orders. Untouched ingredients omitted so machine applies proportional scaling via CUP_SIZE / Nominal ratio. Note: Silo recipes have `Scalable=False` in firmware — scaling is a machine-side limitation for those.
  4. **Gravimetric calculated cups**: Replaced fragile recursive top-up loop with calculated cup count (`Math.min(255, ceil(targetKg / nominalKg) + 2)`). DoseController sends `cancelOrder()` at target weight.
  5. **Gravimetric slider**: 0.1-120kg range with 0.1kg resolution (was limited to recipe range).
  6. **Profile corruption protection**: `DoseController.loadProfile()` rejects and resets profiles with `valveDelay > 5s` or `flowRate > 1.0 kg/s` or `flowRate <= 0`.
- **Files Changed**: `DrinkCustomizer.tsx`, `DrinkCustomizer.css`, `DoseController.ts`, `MenuDetailsParser.ts`, `MenuDetails.ts`
- **Verified**: Live-tested on machine — gravimetric dosing, cup selection, and standard brewing all confirmed working.
- **Service**: `scale_bridge` enabled for auto-start on boot (`systemctl enable`)
