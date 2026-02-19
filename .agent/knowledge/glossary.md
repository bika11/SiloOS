# SiloOS Glossary

Plain-English definitions for terms used in this project.

## Hardware & Systems
- **TopBrewer**: The Scanomat coffee machine being repurposed.
- **Laumas TLS485**: The industrial scale used for gravimetric measurements.
- **RS485**: The serial communication standard used by the scale.
- **BLE (Bluetooth Low Energy)**: The wireless protocol used to talk to the TopBrewer.
- **Bridge**: The `ble_bridge.py` script that relays data between the dashboard and hardware.

## Protocol & Logic
- **SFWU (Scanomat Firmware Update)**: The binary protocol used by the machine. We use it for control, not just updates.
- **Gravimetric Dosing**: Dispensing material by weight rather than time or flow rate.
- **Predictive Stop**: Closing a valve early because we know material is still "in-flight" or the valve takes time to close.
- **EMA (Exponential Moving Average)**: A way to "learn" patterns (like flow rate) by giving more weight to recent data.
- **Net Weight**: The weight of the material being dispensed, excluding the container (tare).
