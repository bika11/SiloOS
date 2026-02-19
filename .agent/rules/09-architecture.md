# SiloOS Architecture

Architectural patterns and conventions for the SiloOS project.

## Frontend (React)
- **Feature Folders**: Group UI components, hooks, and logic by feature in `src/features/`.
- **Protocol Isolation**: Keep all SFWU packet building and parsing in `src/sfwu/`. UI components should not know about packet offsets or CRCs.
- **State Management**: Use React hooks and contexts for local state. Service-level state (BLE connection, WebSocket) lives in `SiloManager` or `ScaleManager`.

## Protocol (SFWU)
- **Parsers**: Canonical parsers must live in `src/sfwu/parsers/`.
- **Relay Address**: Always use `0x02` as the FROM address for outgoing packets from the PWA.

## Hardware Bridge
- **Central Orchestration**: `ble_bridge.py` is the central hub for WebSocket, BLE, and Serial relay.
- **Statelessness**: The bridge should be as stateless as possible, relaying raw data to the PWA where the heavy logic (dosing, history) resides.
