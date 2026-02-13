# Developer Handover: SiloOS Scale Integration

This document summarizes the SiloOS Bridge 2.0 system for developers adding scale support to the PWA.

## 1. Project Overview
The SiloOS Bridge is a Raspberry Pi 4 gateway that "spies" on industrial Laumas weight transmitters via RS-485. It converts raw Modbus-style packets into high-level streams via **Bluetooth LE** and **WebSockets**.

## 2. WebSocket Interface
The PWA should connect to the bridge via WebSockets to receive silent, real-time weight updates.

- **Status**: Live & Operational
- **Address**: `ws://SiloOS.local:8765/` (or use the Pi's static IP if mDNS is not available)
- **Protocol**: Standard WebSocket (no auth required in local network)

## 3. Data Format
The bridge sends a JSON object whenever a new stable weight is read (approx. 10 times per second).

```json
{
  "weight": 60.0
}
```

- **Unit**: Kilograms (kg)
- **Precision**: 0.1 kg (typically)
- **Scale Status**: If the weight is `0.0`, the scale is either empty or in its default state.

## 4. Example Implementation (React/TypeScript)
You can use a simple hook to consume this data in the background without needing a visible UI component.

```typescript
import { useState, useEffect } from 'react';

export function useSiloWeight(wsUrl = 'ws://SiloOS.local:8765/') {
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.weight === 'number') {
          setCurrentWeight(data.weight);
        }
      } catch (err) {
        console.error('Failed to parse weight data', err);
      }
    };

    return () => socket.close();
  }, [wsUrl]);

  return currentWeight;
}
```

## 5. Deployment Note
The bridge runs as a system service on the Pi (`scale_bridge.service`). It starts automatically on boot. No manual intervention is needed on the backend once the code is pushed.
