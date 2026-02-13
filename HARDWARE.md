# Hardware Guide - SiloOS Physical Stack

This document details the physical components and wiring required to rebuild the SiloOS system from scratch.

## 1. Core Components

| Component | specification | Notes |
|-----------|---------------|-------|
| Controller | Raspberry Pi 3B+ (or newer) | Native BLE support required. |
| Scale Controller | Laumas TLS485 | Modbus/RS485 enabled. |
| Serial Bridge | USB-to-RS485 Adapter | Industrial grade with ground terminal recommended. |
| Power Supply | 12-24V DC | For the Laumas scale. |
| Coffee Machine | Scanomat TopBrewer | Must have BLE V3 firmware. |

## 2. Wiring Diagram

### Laumas TLS485 to USB-RS485 Adapter

The connection uses a 2-wire differential pair.

| Laumas Terminal | Function | RS485 Adapter Pin |
|-----------------|----------|-------------------|
| **28**          | RS485 (A+) | A+ (or D+) |
| **29**          | RS485 (B-) | B- (or D-) |
| **30**          | GND | GND (Optional but recommended) |

> [!CAUTION]
> Ensure the Laumas scale is set to **115,200 Baud** in its technical menu (Configuration -> Serial -> Baud). 

## 3. Scale Configuration (Modbus)
The `ble_bridge.py` script expects the scale to be in "Continuous Output" or "Modbus RTU" mode depending on firmware version. 
-   **Address**: 1
-   **Parity**: Even
-   **Stop Bits**: 1

## 4. Raspberry Pi Preparation
To ensure the Bluetooth stack is stable:
1.  **HCI initialization**: The `hciuart` service must be active.
2.  **RFKill**: Bluetooth must be unblocked (`rfkill unblock bluetooth`).
3.  **Permissions**: The user `siloos` must be in the `dialout` and `bluetooth` groups.

## 5. Visual Check
-   **Scale Display**: Should show weight in grams.
-   **RS485 Adapter**: RX/TX LEDs should flicker once every 100ms when the bridge is running.
-   **TopBrewer**: Should beep once when the Pi establishes the native BLE link.
