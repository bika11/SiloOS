# Protocol Agent Role

## Domain
SFWU binary protocol, CRC32-CCITT, packet building/parsing

## Responsibilities
- SFWU packet structure and command implementation
- CRC32-CCITT checksum verification
- Response parsing (brew status, menu, orders, temperatures)
- Command building (coffee commands, order commands)
- Binary data encoding/decoding

## Key Knowledge

### SFWU Protocol Overview
The TopBrewer uses a proprietary binary protocol called SFWU. All communication happens over BLE GATT characteristics.

### Packet Structure
```
[HEADER: 0x01] [LENGTH: 2 bytes] [COMMAND: 2 bytes] [ADDRESS: 2 bytes] [PAYLOAD: N bytes] [CRC32: 4 bytes]
```

### Key Files
```
dashboard/src/sfwu/
├── SFWU.ts              → Packet builder, stream parser, packet finder
├── CRC32.ts             → CRC32-CCITT implementation (byte-identical to Java reference)
├── constants.ts         → Commands (0x00Cx), addresses, enums
├── ResponseFactory.ts   → Dispatches responses to correct parser
├── commands/
│   ├── CoffeeCommands.ts → Reset, menu item requests
│   └── OrderCommand.ts   → Drink ordering with ingredients
├── parsers/             → CANONICAL parsers (use ONLY these)
│   ├── BrewStatusParser.ts
│   ├── MenuParser.ts
│   ├── MenuDetailsParser.ts
│   ├── OrderResponseParser.ts
│   └── TemperaturesParser.ts
├── responses/           → DEPRECATED (duplicate, do NOT use)
└── types/
    └── MenuDetails.ts
```

### Command Flow
1. **Build packet**: `SFWU.buildPacket(command, address, payload)`
2. **Calculate CRC**: Automatic via `CRC32.calculate()`
3. **Send**: Via `TopBrewerConnection` → `RemoteBLEAdapter` → WebSocket → Pi → BLE
4. **Receive**: BLE notification → Pi → WebSocket → `TopBrewerConnection.handleNotification()`
5. **Parse**: `ResponseFactory.parseSfwuPacket()` → dispatches to correct parser
6. **Update state**: Parser returns typed entity (BrewStatus, Menu, etc.)

### Important Constants
- **SFWU Service UUID**: See `bluetooth/constants.ts`
- **Write Characteristic**: Commands sent here
- **Notify Characteristic**: Responses received here
- **Chunk Size**: 20 bytes (BLE MTU)
- **Chunk Delay**: 150ms between writes
- **ACK Timeout**: 5 seconds

### CRC32-CCITT
- Polynomial: 0xEDB88320 (reflected)
- Initial value: 0xFFFFFFFF
- Final XOR: 0xFFFFFFFF
- Implementation matches Java reference exactly

### Common Pitfalls
- ALWAYS use `parsers/` directory, NEVER `responses/` (deprecated duplicate)
- CRC is calculated over header + length + command + address + payload (NOT the CRC field itself)
- Multi-part responses require packet assembly before parsing
- Order commands include ingredient customization bytes
