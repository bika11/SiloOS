# SiloOS Tech Stack

The core technologies driving the Industrial Silo Control System.

## Frontend
- **React 19**: Modern UI framework.
- **TypeScript 5.9**: Type-safe logic.
- **Vite 7.2**: Lightning-fast build tool and dev server.
- **Vanilla CSS**: Clean, performant styling.

## Backend (Hardware Bridge)
- **Python 3.11+**: Orchestration and hardware IO.
- **Bleak**: BLE client for TopBrewer communication.
- **aiohttp**: Async HTTP and WebSocket server for dashboard relay.
- **pyserial**: RS485 communication with the Laumas scale.
- **bluez-peripheral**: Emulating a Bookoo scale for external integrations.

## Infrastructure
- **Raspberry Pi 3B+**: Dedicated hardware controller.
- **Systemd**: Process management and auto-start on boot.
- **PowerShell**: Local developer scripts for syncing and management.
