# Workflow: Feature Development

## Trigger
When implementing a new feature (TASK with "Implement" or "Add" in description).

## Steps

### 1. Claim the Task
- Update task status to `in-progress` in `TASKS.md`
- Note which agent role is working on it

### 2. Research
- Read the relevant skill file for domain knowledge
- Examine existing code patterns in the affected area
- Check if similar features exist that can be extended
- If reference implementations are needed, check `C:\Users\anbdk\OneDrive - scanomat.dk\Desktop\AmokkaTB` for the original Android/PWA apps

### 3. Plan
- Identify all files that need to change
- List the changes in order of dependency
- Note any cross-domain impacts (e.g., WebSocket API changes)

### 4. Implement
- Follow the patterns established in existing code
- Use TypeScript strict mode (no `any` types)
- Use the Logger for diagnostics
- Keep components focused and minimal

### 5. Verify
```bash
cd dashboard
npm run build    # Must pass
npm run lint     # Must pass
```

### 6. Self-Review
Execute skill: `code-review` on your own changes.

### 7. Update Status
- Mark task as `done` in `TASKS.md`
- Update `STATUS.md` with what changed
- If the feature affects hardware, trigger `sync-project` workflow
