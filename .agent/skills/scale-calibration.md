# Skill: Scale Calibration & Integration

## When to Use
- Scale readings are incorrect or missing
- Setting up a new Laumas TLS485 scale
- Debugging RS485 serial communication
- Calibrating gravimetric dosing

## Prerequisites
- Physical access to Raspberry Pi and scale
- USB-RS485 adapter connected to `/dev/ttyUSB0`
- Scale wired to terminals 28 (A+) and 29 (B-) per HARDWARE.md

## Hardware Specs
- **Model**: Laumas TLS485
- **Protocol**: Modbus RTU (RS485)
- **Baud**: 115200
- **Parity**: Even
- **Stop bits**: 1
- **Data bits**: 8
- **Slave address**: 0x01

## Procedure

### Step 1: Verify Physical Connection
Check USB-RS485 adapter:
```bash
ssh -i siloos_key siloos@10.0.124.90 "ls -la /dev/ttyUSB*"
```
Expected: `/dev/ttyUSB0` exists

### Step 2: Run Serial Diagnostics
```bash
ssh -i siloos_key siloos@10.0.124.90 "python3 diag_serial.py"
```
Expected: Raw Modbus frames printed to console

### Step 3: Verify Weight Parsing
In `ble_bridge.py`, the weight is parsed from Modbus response:
```
Frame: [01 03 0A ... weight_h weight_l ... CRC_L CRC_H]
Weight = (weight_h << 8 | weight_l) / scale_factor
```

### Step 4: Test via WebSocket
Connect to the bridge and observe weight updates:
```javascript
const ws = new WebSocket('ws://10.0.124.90:8765/?auth=silo-secret');
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.weight !== undefined) {
    console.log('Weight:', data.weight, 'kg');
  }
};
```

### Step 5: Calibrate Gravimetric Dosing
In `DrinkCustomizer.tsx`:
- `targetWeight`: Desired dose in grams
- `startWeight`: Weight when brewing starts
- `deliveredWeight`: `currentWeight - startWeight`
- Auto-stop when `deliveredWeight >= targetWeight`

### Step 6: Verify Precision
Place known weight on scale:
- 100g test weight should read 100.0 ± 0.5g
- Weight updates should arrive at ~10Hz

## Expected Outcomes
- Scale readings accurate to ±0.5g
- Weight updates at ~10Hz via WebSocket
- Gravimetric dosing auto-stops within 1g of target

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No `/dev/ttyUSB0` | Check USB adapter, try different port |
| Zero readings | Check wiring polarity (A+/B-) |
| Noisy readings | Add 120Ω termination resistor |
| Readings drift | Allow scale to warm up (5 min) |
| Wrong unit | Scale is in kg, dashboard converts |
