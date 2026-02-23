# Lessons Registry (Boris Loop)

This is the system's immune system. Every error encountered, diagnosed, and resolved gets logged here with a prevention rule. The agent reads this file at the start of every session and before every task to avoid repeating past mistakes.

## Format

```
[DATE] SEVERITY: [low|medium|high|critical]
  ERROR: What went wrong
  CONTEXT: What was being attempted when it happened
  CAUSE: Root cause (why it actually failed)
  FIX: What resolved the immediate issue
  PREVENT: Rule to avoid this in the future
```

## Example Entry

```
[2026-02-18] SEVERITY: medium
  ERROR: npm install failed with peer dependency conflict
  CONTEXT: Installing dependencies for the React frontend
  CAUSE: React 19 has strict peer dependency requirements that conflict with older packages
  FIX: Ran npm install --legacy-peer-deps
  PREVENT: In this project, always use npm install --legacy-peer-deps
```

## Active Lessons

[2026-02-19] SEVERITY: high
  ERROR: UI state drift and listener overwrites
  CONTEXT: Multiple components (App.tsx and SettingsScreen.tsx) trying to sync settings via SiloManager.
  CAUSE: Single callback properties (e.g., `onSettingsUpdate`) were being overwritten when new components mounted.
  FIX: Implemented a multi-listener pattern (`addSettingsListener`/`removeSettingsListener`) using an array of callbacks.
  PREVENT: Always use multi-listener patterns for core managers/adapters shared across the application.

[2026-02-19] SEVERITY: medium
  ERROR: Interactive element misalignment in industrial views
  CONTEXT: Aligning recipe visibility toggles and names in the settings list.
  CAUSE: Flexbox utilities created inconsistent spacing in dense lists with varying text lengths.
  FIX: Used CSS Grid (`grid-template-columns: 1fr 48px`) to pin toggles to the right.
  PREVENT: Use CSS Grid for critical UI alignments in industrial dashboards to ensure pixel-perfect positioning.

[2026-02-23] SEVERITY: high
  ERROR: `dbus_next.errors.DBusError: No object received` during `service.register()`
  CONTEXT: Running `ble_bridge.py` on a fresh Raspberry Pi OS (Debian Trixie) install via `setup.sh`.
  CAUSE: The Linux BlueZ daemon rejected unprivileged DBUS GATT application registrations on new installs, taking down the entire Python script and stopping the Cable/WebSocket scale reader mode.
  FIX: Wrapped the BLE GATT `service.register()` call in a `try/except` block to allow graceful fallback to USB Cable/WebSocket mode.
  PREVENT: Never allow a secondary broadcasting protocol (like BLE emulation) to crash the primary data collection loop (RS485/WebSocket). Always wrap experimental hardware interfaces in `try/except` fallbacks.
