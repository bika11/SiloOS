---
name: siloos-scale-calibration
description: "Troubleshooting Laumas scale readings, RS485 serial communication, and calibrating gravimetric dosing."
---

# SiloOS Scale Calibration Skill

## When to Use
- Scale readings are incorrect or missing
- Setting up a new Laumas TLS485 scale
- Debugging RS485 serial communication
- Calibrating gravimetric dosing

## Hardware Specs
- **Model**: Laumas TLS485
- **Protocol**: Modbus RTU (RS485)
- **Baud**: 115200, Parity: Even, Slave: 0x01

## Procedure

### Step 1: Verify Physical Connection
Check USB-RS485 adapter:
```bash
ssh -i siloos_key siloos@10.0.124.90 "ls -la /dev/ttyUSB*"
```

### Step 2: Run Serial Diagnostics
```bash
ssh -i siloos_key siloos@10.0.124.90 "python3 diag_serial.py"
```

### Step 3: Test via WebSocket
Connect to the bridge and observe weight updates:
```javascript
const ws = new WebSocket('ws://10.0.124.90:8765/?auth=silo-secret');
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.weight !== undefined) console.log('Weight:', data.weight, 'kg');
};
```

### Step 4: Calibrate Gravimetric Dosing
In `DoseController.ts` (precision dosing engine):
- `targetKg`: Desired dose in kg (set via DrinkCustomizer stepper)
- `tareWeightKg`: Weight when brewing starts (auto-captured)
- Auto-stop uses learned flow rate + valve delay + bias correction
- Profile is persisted on Pi, accuracy improves with each dose (±0.1 kg after ~3 doses)
- Key parameters: `flowRateKgPerS`, `valveDelayS`, `recentOvershootsKg[]`
