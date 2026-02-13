# Frontend Agent Role

## Domain
React 19 + TypeScript 5.9 + Vite 7.2 dashboard PWA

## Responsibilities
- UI component development in `dashboard/src/features/`
- State management and React hooks
- Styling (CSS modules in `dashboard/src/`)
- Build configuration (Vite, TypeScript, ESLint)
- Web Bluetooth integration (BLEAdapter, RemoteBLEAdapter)
- WebSocket client management (SiloManager)

## Key Knowledge

### Project Structure
```
dashboard/src/
├── main.tsx              → Entry point
├── App.tsx               → Root component, manages connection state
├── bluetooth/            → BLE + WebSocket communication
├── features/             → UI screens
│   ├── dashboard/        → Main status screen
│   ├── menu/             → Drink selection
│   ├── customization/    → Gravimetric dosing
│   ├── scale/            → Weight readout
│   ├── discovery/        → Device discovery
│   ├── order/            → (empty - needs implementation)
│   └── settings/         → (empty - needs implementation)
├── entities/             → TypeScript interfaces
└── utils/                → Logger, XML parser
```

### Connection Flow
1. `App.tsx` creates `TopBrewerConnection` on mount
2. `TopBrewerConnection` uses `RemoteBLEAdapter` to connect via WebSocket to Pi
3. `SiloManager` handles WebSocket lifecycle, auth, reconnection
4. All BLE reads/writes are proxied through the Pi bridge

### Patterns to Follow
- Use React hooks (`useState`, `useEffect`, `useRef`, `useCallback`)
- TypeScript strict mode is enabled — all types must be explicit
- Components receive `TopBrewerConnection` as a prop from `App.tsx`
- Use `logger.ts` for diagnostic logging (persists to localStorage)

### Build Commands
```bash
cd dashboard
npm run dev -- --host    # Dev server with network access
npm run build            # Production build
npm run lint             # ESLint check
```

### Common Pitfalls
- Vite HMR host is hardcoded — use env vars instead
- Web Bluetooth API only works in secure contexts (HTTPS or localhost)
- BLE MTU is 20 bytes — large writes must be chunked
- WebSocket reconnect delay is 5 seconds
