# SiloOS Coding Style

Rules for maintaining consistency across the SiloOS codebase.

## TypeScript (Frontend)
- **Naming**: Use `camelCase` for variables, functions, and file names. Use `PascalCase` for classes, interfaces, and types.
- **Styles**: Use Vanilla CSS in `.css` files. Avoid inline styles.
- **Logging**: Use the `logger` utility from `src/utils/logger.ts`. Never use `console.log`.
- **Strictness**: TypeScript strict mode is mandatory. Avoid `any` at all costs.

## Python (Bridge)
- **Naming**: Use `snake_case` for variables, functions, and script names. Use `PascalCase` for classes.
- **Logging**: Use the standard `logging` module with the "SiloOS" logger name.
- **Async**: Use `asyncio` for all I/O bound operations (BLE, WebSocket, Serial).
- **Environment**: Always use `pip install --user --break-system-packages` on the Raspberry Pi if not in a venv.
