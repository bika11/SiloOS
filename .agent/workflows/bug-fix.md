# Workflow: Bug Fix

## Trigger
When investigating and fixing a bug (TASK with "Fix" in description, or issue reported).

## Steps

### 1. Reproduce
- Understand the reported behavior
- Identify the expected behavior
- Determine which component is affected (frontend, hardware, protocol)

### 2. Investigate
- Read relevant source code
- Check logs (`logger.ts` output, Pi `journalctl`)
- Use skill: `ble-debug` if BLE-related
- Check reference implementation at `C:\Users\anbdk\OneDrive - scanomat.dk\Desktop\AmokkaTB` for correct behavior

### 3. Root Cause
- Identify the specific code causing the issue
- Document the root cause in the task

### 4. Fix
- Make the minimal change to fix the issue
- Do NOT refactor surrounding code
- Do NOT add unrelated improvements

### 5. Verify
```bash
cd dashboard
npm run build    # Must pass
npm run lint     # Must pass
```

### 6. Regression Check
- Verify the fix doesn't break existing functionality
- Test adjacent features that share the same code paths

### 7. Update Status
- Mark task as `done` in `TASKS.md`
- Update `STATUS.md` with what changed
- Add to the "Known Issues" resolution log if applicable
