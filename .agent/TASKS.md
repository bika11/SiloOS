# SiloOS Task Board

> Prioritized backlog for all agents. Update status as you work.
> Format: `open` → `in-progress` → `review` → `done`

---

## P0 — Critical

### TASK-000: Fix SFWU relay address (PRIMARY BUG)
- **Priority**: P0
- **Agent**: protocol
- **Status**: done ✅ (2026-02-12)
- **Description**: `SFWU_ADDR.RELAY` was `0x03` (SERVER) instead of `0x02` (RELAY). Every outgoing SFWU packet had wrong FROM address, causing the TopBrewer machine to reject or misroute commands. Fixed to match Android reference (SFWU.java line 43: `SFWU_ADDR_RELAY = 0x02`).
- **Files Changed**: `dashboard/src/sfwu/constants.ts`, `dashboard/src/sfwu/SFWU.ts`
- **Root Cause**: Misidentified address from observed machine response packets (machine sends TO 0x03 for server, but app should send FROM 0x02 as relay)

### TASK-001: Remove duplicate SFWU parsers
- **Priority**: P0
- **Agent**: protocol
- **Status**: open
- **Description**: Delete `dashboard/src/sfwu/responses/` directory entirely. The canonical parsers live in `dashboard/src/sfwu/parsers/`. Verify no imports reference the `responses/` path.
- **Acceptance Criteria**: `responses/` directory deleted, `npm run build` passes, no broken imports
- **Related Issue**: ISS-001

### TASK-002: Remove SSH key from repository
- **Priority**: P0
- **Agent**: qa
- **Status**: open
- **Description**: Add `siloos_key` and `siloos_key.pub` to `.gitignore`. These files should remain on disk but not be tracked. Rotate the key on the Pi if repo has been shared.
- **Acceptance Criteria**: `.gitignore` updated, git stops tracking key files
- **Related Issue**: ISS-002

### TASK-003: Externalize auth token
- **Priority**: P0
- **Agent**: hardware + frontend
- **Status**: open
- **Description**: Move hardcoded `silo-secret` token to environment variables. Create `.env.example` for the dashboard. Update `SiloManager.ts` to read from `import.meta.env.VITE_WS_AUTH_TOKEN`. Update `config.json` docs.
- **Acceptance Criteria**: No hardcoded tokens in source, `.env.example` exists, app still authenticates
- **Related Issue**: ISS-003

---

## P1 — High

### TASK-004: Fix Vite HMR hardcoded IP
- **Priority**: P1
- **Agent**: frontend
- **Status**: open
- **Description**: Replace hardcoded `10.0.124.90` in `vite.config.ts` with environment variable `VITE_PI_HOST` or auto-detection.
- **Acceptance Criteria**: HMR works without hardcoded IP, env variable documented
- **Related Issue**: ISS-004

### TASK-005: Create requirements.txt for Python dependencies
- **Priority**: P1
- **Agent**: hardware
- **Status**: open
- **Description**: Create `requirements.txt` with pinned versions of all Python dependencies. Update `setup.sh` to use `pip install -r requirements.txt`.
- **Acceptance Criteria**: `requirements.txt` exists with pinned versions, `setup.sh` updated
- **Related Issue**: ISS-005

### TASK-006: Add bridge connection status UI
- **Priority**: P1
- **Agent**: frontend
- **Status**: open
- **Description**: Add a visible connection status indicator to `DashboardScreen.tsx`. Show "Bridge Offline" when WebSocket disconnects, "Connecting..." during reconnect, "Connected" when active.
- **Acceptance Criteria**: User can see bridge connection state at all times
- **Related Issue**: ISS-006

---

## P2 — Medium

### TASK-007: Set up Vitest test runner
- **Priority**: P2
- **Agent**: qa
- **Status**: open
- **Description**: Add Vitest to the dashboard project. Migrate `dashboard/src/sfwu/tests.ts` to proper Vitest format. Add `test` script to `package.json`.
- **Acceptance Criteria**: `npm test` runs SFWU tests, tests pass
- **Related Issue**: ISS-007

### TASK-008: Implement Settings page
- **Priority**: P2
- **Agent**: frontend
- **Status**: open
- **Description**: Create a Settings screen allowing configuration of: Pi host/port, auth token, BLE scan parameters, scale units (g/kg/oz).
- **Acceptance Criteria**: Settings page renders, values persist in localStorage
- **Related Issue**: ISS-008

### TASK-009: Display temperature readings in dashboard
- **Priority**: P2
- **Agent**: frontend
- **Status**: open
- **Description**: `TemperaturesParser` exists but data is not shown in UI. Add a temperature readout section to `DashboardScreen.tsx`.
- **Acceptance Criteria**: Boiler and group head temperatures visible when available
- **Related Issue**: ISS-009

### TASK-010: Implement Order History tracking
- **Priority**: P2
- **Agent**: frontend
- **Status**: open
- **Description**: Create an order history feature that logs drink orders with timestamps, weight data, and status. Store in localStorage.
- **Acceptance Criteria**: Orders tracked, viewable in UI, persisted across sessions
- **Related Issue**: ISS-008

---

## P3 — Low

### TASK-011: Organize legacy Python scripts
- **Priority**: P3
- **Agent**: hardware
- **Status**: open
- **Description**: Move `ble_bridge_clean.py`, `temp_bridge.py`, `diag_serial.py`, `find_machine.py` into a `tools/` subdirectory.
- **Acceptance Criteria**: Root directory cleaner, tools still accessible
- **Related Issue**: ISS-010

### TASK-012: Fix barrel exports in bluetooth module
- **Priority**: P3
- **Agent**: frontend
- **Status**: open
- **Description**: Add `TopBrewerConnection`, `SiloManager`, `ScaleManager` to `dashboard/src/bluetooth/index.ts` exports.
- **Acceptance Criteria**: All public classes importable from `./bluetooth`
- **Related Issue**: ISS-011

### TASK-013: Audit xmlParser.ts usage
- **Priority**: P3
- **Agent**: qa
- **Status**: open
- **Description**: Determine if `xmlParser.ts` is still used. If legacy-only, mark as deprecated or remove.
- **Acceptance Criteria**: Usage confirmed or file removed
- **Related Issue**: ISS-012

---

## Completed

### TASK-000: Fix SFWU relay address ✅
- Completed 2026-02-12 by protocol agent (Claude Code)
- Changed `SFWU_ADDR.RELAY` from `0x03` to `0x02` in `constants.ts`
- Removed stray `console.log` from `SFWU.ts`
- This was the primary reason the project was "not working as intended"

### TASK-014: Match Ordering and Precision Gravimetric Dosing ✅
- Completed 2026-02-12 by frontend + hardware agent
- **Description**: Replace rudimentary weight-delta dosing with precision gravimetric system featuring predictive shutoff, flow rate tracking, stall detection, and brew monitoring UI
- **Approach**: Baseline weight (no hardware tare) — records starting weight, computes dispensed = current - baseline
- **Files Created**:
  - `dashboard/src/features/dosing/DoseController.ts` — Dosing engine (state machine, predictive shutoff, rolling flow rate, stall detection)
  - `dashboard/src/features/dosing/BrewMonitor.tsx` — Full-screen overlay (SVG progress ring, live weight, flow rate, result summary)
  - `dashboard/src/features/dosing/BrewMonitor.css` — Dark overlay styles with color transitions
- **Files Modified**:
  - `ble_bridge.py` — Added optional tare handler + net weight field in broadcasts
  - `dashboard/src/bluetooth/SiloManager.ts` — Added `tare()`, `getNetWeight()`, `onNetWeightUpdate` event
  - `dashboard/src/features/customization/DrinkCustomizer.tsx` — Removed old gravimetric logic, wired DoseController + BrewMonitor
- **Reference**: See `Match Ordering and Precision Gravimetric Dosing.md` in project root

### TASK-015: Fix Gravimetric Learning Logic ✅
- Completed 2026-02-16 by dosing agent (Claude Code)
- **Description**: Gravimetric dosing would only learn from overshoots (positive `materialAfterStop`). If it undershot (stopped too early), it got stuck in a cautious state.
- **Fix**: Removed the `materialAfterStop > 0` condition in `DoseController.ts` and allowed `valveDelay` to decrease. Added safety clamp to 0.
- **Files Changed**: `dashboard/src/features/dosing/DoseController.ts`

### TASK-016: Gravimetric Weight Polling, Cup Selection, Order Scaling ✅
- Completed 2026-02-18 by frontend + protocol agent (Claude Code)
- **Description**: Three-part fix: (1) gravimetric weight pipeline race condition, (2) standard mode order scaling, (3) cup selection UI
- **Changes**:
  - Replaced events monkey-patching with 10Hz polling + useRef for synchronous DoseController access
  - Exposed `carafe` flag from SFWU parser, added 1-5 cup selector UI
  - Only user-modified ingredients sent in orders (allows machine proportional scaling)
  - Replaced recursive top-up loop with calculated cup count + DoseController cancel
  - Gravimetric slider: 0.1-120kg @ 0.1kg resolution
  - Profile corruption protection in DoseController.loadProfile()
  - Enabled `scale_bridge` systemd service for auto-start on boot
- **Files Changed**: `DrinkCustomizer.tsx`, `DrinkCustomizer.css`, `DoseController.ts`, `MenuDetailsParser.ts`, `MenuDetails.ts`
- **Verified**: Live-tested on machine — all features confirmed working
