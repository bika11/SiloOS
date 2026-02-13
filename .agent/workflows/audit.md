# Workflow: Project Audit

## Trigger
Periodic health check, or when taking over the project.

## Steps

### 1. Map the Codebase
- List all files and directories
- Identify the tech stack and dependencies
- Note file sizes and modification dates

### 2. Read All Configuration
- `config.json` — runtime config
- `package.json` — npm dependencies
- `tsconfig*.json` — TypeScript config
- `vite.config.ts` — build config
- `eslint.config.js` — lint config
- `.env*` — environment variables
- `setup.sh` — system setup

### 3. Read All Source Code
- Python bridge files
- TypeScript/React source
- SFWU protocol implementation
- Utility files

### 4. Check Build Health
```bash
cd dashboard
npm install
npm run build
npm run lint
```

### 5. Identify Issues
For each file, check:
- [ ] Imports resolve correctly
- [ ] No dead code or unused exports
- [ ] No duplicate functionality
- [ ] No hardcoded configuration
- [ ] Error handling present
- [ ] Security best practices followed

### 6. Reference Check
Compare implementation against reference apps:
- Android app: `C:\Users\anbdk\OneDrive - scanomat.dk\Desktop\AmokkaTB`
- Check protocol compliance, command sequences, UI flows

### 7. Document Findings
- Update `STATUS.md` with current health metrics
- Create new tasks in `TASKS.md` for each issue found
- Assign priority (P0-P3) based on impact

### 8. Report
Provide the user with:
- Architecture overview
- Issue list with priorities
- Recommended action plan
- Current system health assessment
