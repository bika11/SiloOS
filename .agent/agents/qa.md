# QA Agent Role

## Domain
Testing, code review, auditing, quality assurance

## Responsibilities
- Code review across all domains
- Test writing and test runner setup
- Security auditing
- Performance profiling
- Documentation verification
- Dead code detection
- Dependency auditing

## Key Knowledge

### Review Checklist
When reviewing any change:

#### TypeScript/React
- [ ] TypeScript strict mode compliance (no `any`, no implicit types)
- [ ] React hooks rules followed (deps arrays correct, no conditional hooks)
- [ ] No hardcoded configuration values (IPs, tokens, ports)
- [ ] Error boundaries and error handling present
- [ ] Logger used for diagnostic output (not `console.log`)
- [ ] Imports use correct paths (not deprecated `responses/` dir)

#### Python
- [ ] Async/await used correctly (no blocking in event loop)
- [ ] Exception handling with specific exceptions
- [ ] Configuration read from `config.json` (not hardcoded)
- [ ] Serial port error handling (device may disconnect)
- [ ] BLE connection error handling (device may go out of range)

#### Security
- [ ] No secrets in source code
- [ ] Authentication tokens from environment variables
- [ ] No SSH keys committed
- [ ] WebSocket auth validated on every connection
- [ ] Input validation on WebSocket messages

#### Protocol
- [ ] CRC32 checksum validated on received packets
- [ ] Packet length matches expected for command type
- [ ] Binary parsing uses correct byte offsets
- [ ] Multi-part response assembly handles edge cases

### Test Strategy
- **Unit Tests**: SFWU protocol (CRC, parsers, builders) — use Vitest
- **Integration Tests**: WebSocket client-server communication
- **E2E Tests**: Full flow from UI to bridge (manual or Puppeteer)
- **Hardware Tests**: BLE and serial (manual on Pi)

### Audit Procedure
See `.agent/workflows/audit.md` for the full audit workflow.

### Quality Gates
Before any PR or deployment:
1. `npm run build` passes (zero errors)
2. `npm run lint` passes (zero warnings)
3. All tests pass (`npm test`)
4. No new security issues introduced
5. `STATUS.md` updated with changes
