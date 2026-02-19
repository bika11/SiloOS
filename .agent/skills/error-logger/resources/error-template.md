# Error Log Entry Template

Copy this template when adding a new entry to lessons.md.

---

```
[YYYY-MM-DD] SEVERITY: [low|medium|high|critical]
  ERROR: [The exact error message or a concise description of what went wrong]
  CONTEXT: [What you were trying to accomplish when the error occurred]
  CAUSE: [The root cause — WHY it failed, not just WHAT the error says]
  FIX: [The specific action that resolved the immediate problem]
  PREVENT: [A rule or practice that will stop this from happening again]
```

## Examples

### Low Severity
```
[2026-02-18] SEVERITY: low
  ERROR: Warning - deprecated function crypto.createCipher used
  CONTEXT: Running the test suite
  CAUSE: An old library uses a deprecated Node.js API
  FIX: No immediate fix needed — this is a warning, not a failure
  PREVENT: When upgrading dependencies, check for this library and replace it
```

### Medium Severity
```
[2026-02-18] SEVERITY: medium
  ERROR: npm ERR! ERESOLVE unable to resolve dependency tree
  CONTEXT: Installing new package react-datepicker
  CAUSE: react-datepicker requires React 18 but project uses React 19
  FIX: Used npm install --legacy-peer-deps to bypass strict resolution
  PREVENT: Always use --legacy-peer-deps in this project. Consider upgrading react-datepicker when v5 releases
```

### High Severity
```
[2026-02-18] SEVERITY: high
  ERROR: Build failed - Cannot find module './UserProfile'
  CONTEXT: Building for production after renaming UserProfile component
  CAUSE: Renamed the file but forgot to update 3 import statements in other files
  FIX: Updated imports in Dashboard.tsx, Settings.tsx, and App.tsx
  PREVENT: After renaming any file, always search the entire project for imports of the old name before building
```

### Critical Severity
```
[2026-02-18] SEVERITY: critical
  ERROR: Database migration dropped the users table
  CONTEXT: Running migration to add a new column to users table
  CAUSE: Migration script contained DROP TABLE instead of ALTER TABLE
  FIX: Restored from backup. Rewrote migration correctly
  PREVENT: ALWAYS review migration SQL before running. Never run migrations without a backup. Add this as a Tier 4 action in trust tiers.
```
