# Lessons Registry (Boris Loop)

This is the system's immune system. Every error encountered, diagnosed, and resolved gets logged here with a prevention rule. The agent reads this file at the start of every session and before every task to avoid repeating past mistakes.

## Format

```
[DATE] SEVERITY: [low|medium|high|critical]
  ERROR: What went wrong
  CONTEXT: What was being attempted when it happened
  CAUSE: Root cause (why it actually failed)
  FIX: What resolved the immediate issue
  PREVENT: Rule to avoid this in the future
```

## Example Entry

```
[2026-02-18] SEVERITY: medium
  ERROR: npm install failed with peer dependency conflict
  CONTEXT: Installing dependencies for the React frontend
  CAUSE: React 19 has strict peer dependency requirements that conflict with older packages
  FIX: Ran npm install --legacy-peer-deps
  PREVENT: In this project, always use npm install --legacy-peer-deps
```

## Active Lessons

_No lessons logged yet. Entries will appear here as the agent encounters and resolves errors._
