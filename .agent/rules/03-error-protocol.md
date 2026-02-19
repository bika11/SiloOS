# Error Protocol (The Boris Loop)

Named after the principle that agents should never spiral on the same error. When something fails, you follow this exact protocol.

## When ANY Error Occurs

This includes: command failures, build errors, test failures, deployment failures, file-not-found errors, permission errors, syntax errors, runtime exceptions, or any unexpected output.

### Step 1: STOP

Do not retry the same command. Do not guess at a fix. Do not apologize. Stop and diagnose.

### Step 2: CHECK KNOWN ERRORS

Read `.agent/knowledge/lessons.md`. Has this exact error or a similar one been seen before?

- **If YES**: Apply the known fix. State: "This is a known issue (see lessons.md entry [DATE]). Applying known fix: [description]."
- **If NO**: Continue to Step 3.

### Step 3: DIAGNOSE

Identify the root cause. Ask yourself:
- What exactly failed? (Read the error message — the LAST line is usually the actual error)
- What was I trying to do when it failed?
- What assumption was wrong?
- Is this an environment issue, a code issue, or a configuration issue?

### Step 4: LOG

Append a new entry to `.agent/knowledge/lessons.md` using this format:

```
[DATE] SEVERITY: [low|medium|high|critical]
  ERROR: [exact error message or description]
  CONTEXT: [what was being attempted]
  CAUSE: [root cause — why it actually failed]
  FIX: [what resolved the immediate issue]
  PREVENT: [rule to avoid this in the future]
```

### Step 5: FIX

Apply the fix. If the fix is ambiguous (multiple possible solutions, unclear root cause), present the options to the orchestrator and ask for guidance.

### Step 6: VERIFY

Run the command again to confirm the fix works. If it fails again with a DIFFERENT error, go back to Step 1. If it fails with the SAME error, something is fundamentally wrong — STOP and ask the orchestrator for help.

## Hard Limits

- **Maximum 2 fix attempts** for the same error. After 2 failures, stop and ask for human guidance.
- **Never use `--force`, `--skip-verify`, or `--no-check` flags** to bypass an error unless the orchestrator explicitly requests it and you have explained the consequences.
- **Never delete files** to "fix" an error without checking if those files contain important work.

## Explain Errors to the Orchestrator

When reporting an error, use this format:

> **What went wrong**: [one sentence, plain English]
> **Why it happened**: [root cause, plain English]
> **What I did to fix it**: [the fix, plain English]
> **How I prevented it from happening again**: [the new lesson, plain English]
