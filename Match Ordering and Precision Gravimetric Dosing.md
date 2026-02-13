# Match Ordering and Precision Gravimetric Dosing

> Implementation plan for correlating machine orders with scale weight curves and replacing time-based dosing with weight-based auto-stop.

## Status Tracker

- [x] Phase 0: Codebase analysis & planning
- [ ] Phase 1: Dosing Engine (`DoseController.ts`)
- [ ] Phase 2: Pi Bridge — tare command + higher-rate weight stream
- [ ] Phase 3: Brew Monitor UI (`BrewMonitor.tsx`)
- [ ] Phase 4: DrinkCustomizer integration & order flow changes
- [ ] Phase 5: Live system verification on Pi
- [ ] Phase 6: Walkthrough & documentation

---

## Problem Statement

The current gravimetric dosing in `DrinkCustomizer.tsx` works like this:
1. User enables "Gravimetric Dosing" checkbox
2. On brew, it captures `startWeight = siloManager.getWeight()`
3. A `useEffect` monitors `siloManager.events.onWeightUpdate` for each weight change
4. When `(currentWeight - startWeight) * 1000 >= targetWeight`, it calls `connection.cancelOrder()`

**Issues:**
- No tare — relies on raw absolute weight difference, cup weight not zeroed
- No drip compensation — coffee continues to drip after the machine valve closes (~2-5g overshoot)
- No predictive shutoff — doesn't account for flow rate to stop early
- Weight is in kg from the bridge, converted to ml by `× 1000` (water≈1g/ml, but coffee density differs)
- No visual feedback during gravimetric brew (no progress bar, no live weight delta)
- No order-to-weight correlation (match ordering) — can't review what was dispensed

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React PWA (dashboard)                                  │
│                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │DrinkCustom- │──▶│ DoseController│──▶│ BrewMonitor  │ │
│  │izer.tsx     │   │ .ts           │   │ .tsx         │ │
│  └─────────────┘   └──────┬───────┘   └──────────────┘ │
│                           │                             │
│  ┌────────────────────────▼──────────────────────────┐  │
│  │ TopBrewerConnection.ts (order + cancel)            │  │
│  │ SiloManager.ts (weight stream + tare command)      │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │ WebSocket
┌────────────────────────────▼────────────────────────────┐
│  Raspberry Pi (ble_bridge.py)                           │
│  • tare command handler                                 │
│  • weight stream (existing, unchanged)                  │
│  • BLE relay to TopBrewer                               │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Dosing Engine — `DoseController.ts`

> **New file:** `dashboard/src/features/dosing/DoseController.ts`

A standalone, framework-agnostic controller that encapsulates all precision dosing logic.

### Responsibilities
- **Tare**: Record baseline weight at brew start → `tareWeight`
- **Live tracking**: Subscribe to weight stream, compute `dispensed = current - tareWeight`
- **Predictive shutoff**: Maintain rolling flow-rate (g/s), predict when to send stop command to hit target exactly. Formula: `stopAt = target - (flowRate * VALVE_DELAY_S) - DRIP_OFFSET_G`
- **State machine**: `idle → tared → dosing → stopping → done | aborted`
- **Configurable parameters**: `VALVE_DELAY_S` (default 0.8s), `DRIP_OFFSET_G` (default 2.0g), `MIN_FLOW_RATE` (0.5 g/s for stall detection)
- **Events**: `onDoseUpdate(dispensed, target, flowRate, state)`, `onDoseComplete(result)`, `onDoseAborted(reason)`
- **Result object**: `{ targetG, actualG, overshootG, durationMs, avgFlowRate }`

### Key Logic
```typescript
// Predictive shutoff calculation
const predictedOvershoot = flowRate * VALVE_DELAY_S + DRIP_OFFSET_G;
const effectiveTarget = targetG - predictedOvershoot;
if (dispensed >= effectiveTarget) {
    this.state = 'stopping';
    this.onStop(); // calls connection.cancelOrder()
}
```

### Flow Rate
- Computed as rolling average over last 5 weight samples
- `flowRate = deltaWeight / deltaTime` in g/s
- Used for display AND for predictive shutoff

---

## Phase 2: Pi Bridge — Tare Command

> **Modify:** `ble_bridge.py` + `SiloManager.ts`

### Bridge Changes (`ble_bridge.py`)
Add a `tare` WebSocket command that records the current weight as offset:

```python
# In websocket_handler message loop:
elif data.get("type") == "tare":
    tare_offset = current_weight
    await ws.send_str(json.dumps({"type": "tare_ack", "offset": tare_offset}))
```

Then subtract tare from outgoing weight:
```python
# Broadcasting net weight alongside gross
await broadcast_relay({"weight": current_weight, "net": current_weight - tare_offset})
```

### PWA Changes (`SiloManager.ts`)
Add `tare()` method:
```typescript
async tare(): Promise<number> { /* send {type:"tare"}, wait for tare_ack */ }
```

Add `net` weight tracking alongside existing `weight`.

---

## Phase 3: Brew Monitor UI — `BrewMonitor.tsx`

> **New file:** `dashboard/src/features/dosing/BrewMonitor.tsx` + `BrewMonitor.css`

A full-screen overlay component shown during active gravimetric brews.

### UI Elements
- **Large weight display**: `{dispensed.toFixed(1)}g / {target}g`
- **Progress ring/bar**: Circular progress from 0 to target
- **Flow rate indicator**: `{flowRate.toFixed(1)} g/s`
- **Status text**: "Taring… → Dosing… → Stopping… → Complete!"
- **Abort button**: Cancels order immediately
- **Result summary**: On completion, shows actual vs target, overshoot

### Design Notes
- Dark overlay, large typography for visibility at distance
- Pulse animation on weight changes (reuse existing ScaleReadout pulse pattern)
- Green → Amber → Red progress as dose approaches target

---

## Phase 4: DrinkCustomizer Integration

> **Modify:** `dashboard/src/features/customization/DrinkCustomizer.tsx`

### Changes
1. Replace inline `useEffect` gravimetric logic with `DoseController` instance
2. On brew with gravimetric enabled:
   - Create `DoseController` with target weight
   - Call `siloManager.tare()` to zero the scale
   - Send order to machine
   - Render `<BrewMonitor>` overlay with DoseController bound
3. DoseController handles the auto-stop via `connection.cancelOrder()`
4. On completion, close overlay and show brief result toast

### Removed Code
- The entire `useEffect` block at lines 80-98 that manually watches `siloManager.events.onWeightUpdate`
- The `startWeight`, `isBrewing`, `targetWeight` state variables

---

## Phase 5: Live System Verification

### Test Plan
1. **Scale tare test**: Send tare command from PWA, verify `net` weight is 0 on Pi logs
2. **Weight stream test**: Place known weight on scale, verify PWA shows correct value
3. **Dry-run dosing test**: Start a brew with gravimetric enabled, verify DoseController state transitions without actually brewing (can test with espresso settings, target 30g)
4. **Full brew test**: Brew an espresso with gravimetric dosing, verify:
   - Tare happens before brew
   - Live weight shows increasing dispensed amount
   - Machine stops when target reached (within ±3g tolerance)
   - Result shows actual vs target
5. **Abort test**: Start brew, hit abort, verify machine stops

### Verification Commands
```bash
# Check Pi bridge logs during test
ssh -i siloos_key siloos@10.0.124.90 "sudo journalctl -u scale_bridge -f"

# Check dashboard builds
cd dashboard && npm run build
```

---

## Phase 6: Documentation

Update `Match Ordering and Precision Gravimetric Dosing.md` (this file) with results and mark all phases complete. Create walkthrough artifact documenting the implementation.

---

## Files Changed Summary

| Action | File | Description |
|--------|------|-------------|
| NEW | `dashboard/src/features/dosing/DoseController.ts` | Precision dosing engine |
| NEW | `dashboard/src/features/dosing/BrewMonitor.tsx` | Brew monitoring overlay UI |
| NEW | `dashboard/src/features/dosing/BrewMonitor.css` | Brew monitor styles |
| MODIFY | `ble_bridge.py` | Add tare command handler |
| MODIFY | `dashboard/src/bluetooth/SiloManager.ts` | Add tare() + net weight |
| MODIFY | `dashboard/src/features/customization/DrinkCustomizer.tsx` | Use DoseController |