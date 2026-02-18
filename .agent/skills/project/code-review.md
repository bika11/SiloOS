# Skill: Code Review

## When to Use
- Before merging any changes
- After completing a task (self-review)
- When auditing code quality
- Before deployment to Pi

## Prerequisites
- Access to the full codebase
- Understanding of the agent role doing the review

## Procedure

### Step 1: Scope the Review
Identify which files changed and which domain they belong to:
- `dashboard/src/` → Frontend agent review
- `ble_bridge.py` → Hardware agent review
- `dashboard/src/sfwu/` → Protocol agent review
- Cross-domain → QA agent review

### Step 2: Verify Build
```bash
cd dashboard && npm run build && npm run lint
```
Both must pass with zero errors.

### Step 3: Check TypeScript Strictness
```bash
cd dashboard && npx tsc --noEmit
```
Zero type errors required.

### Step 4: Security Scan
- [ ] No hardcoded secrets (tokens, passwords, keys)
- [ ] No `eval()` or dynamic code execution
- [ ] WebSocket messages validated before processing
- [ ] No XSS vectors in rendered HTML
- [ ] File paths not constructed from user input

### Step 5: Architecture Compliance
- [ ] New components follow existing patterns
- [ ] Imports use correct paths (`parsers/` not `responses/`)
- [ ] Configuration uses `config.json` or env vars
- [ ] Logger used instead of `console.log`
- [ ] No unnecessary dependencies added

### Step 6: Protocol Correctness (if SFWU changes)
- [ ] CRC32 calculation verified against test vectors
- [ ] Byte offsets correct in parsers
- [ ] Command codes match constants.ts
- [ ] Response entity types updated

### Step 7: Documentation
- [ ] `STATUS.md` updated with changes
- [ ] `TASKS.md` task marked as done
- [ ] `README.md` / `HARDWARE.md` updated if behavior changed

## Review Outcome Template
```markdown
## Review: [TASK-ID]
- **Reviewer**: [agent role]
- **Files**: [list of files reviewed]
- **Verdict**: APPROVE | REQUEST CHANGES | BLOCK
- **Findings**:
  - [finding 1]
  - [finding 2]
- **Action Required**: [what needs to change, if any]
```

## Expected Outcomes
- All changes reviewed before deployment
- Issues caught before they reach production
- Documentation stays in sync with code
