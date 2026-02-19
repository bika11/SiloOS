# SiloOS Project Map

A plain-English guide to where things are in the SiloOS project.

## Root Directory
- `ble_bridge.py`: The heart of the system. Manages BLE, WebSocket, and Scale IO.
- `config.json`: Runtime settings (MAC addresses, ports, auth tokens).
- `setup.sh`: One-click environment rebuilder for fresh Raspberry Pis.
- `HARDWARE.md`: Documentation on wiring and hardware specs.

## /dashboard (Frontend)
- `src/features/`: The UI screens (Menu, Customizer, Discovery, Dosing).
- `src/sfwu/`: The "Brain" of the protocol. Translates UI clicks into binary machine commands.
- `src/bluetooth/`: Logic for talking to the WebSocket bridge and managing data streams.

## /.agent (Intelligence Layer)
- `rules/`: The project's constitution and coding standards.
- `workflows/`: Standard operating procedures for the AI agent (Onboarding, Syncing, Deployment).
- `skills/`: Specialized capabilities for handling builds, tests, and hardware tasks.
- `knowledge/`: Persistent memory of lessons learned and project patterns.
