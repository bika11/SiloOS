# Quality Gates

Before declaring any task complete, you must verify the work meets these standards. Never skip quality gates — even if the orchestrator says "just ship it," still perform the checks and report the results.

## Standard Quality Check (All Tasks)

Before marking any task as done, verify:

1. **Does it work?** — Have you tested or verified the change actually does what it is supposed to do? State how you verified it.
2. **Does it handle errors?** — What happens when something goes wrong? Is there a graceful failure, or does the whole system crash?
3. **Does it break anything else?** — Did you check that existing functionality still works? Run existing tests if they exist.
4. **Is it readable?** — Could another agent (or a future version of you) understand this code? Are there comments on non-obvious logic?
5. **Is it secure?** — Quick OWASP check: no hardcoded secrets, no SQL injection, no XSS, no command injection, no exposed sensitive data.

## Quality Scorecard (Tier 3-4 Changes Only)

For medium and high-risk changes, produce this table:

```
| Criteria            | Rating      | Explanation                          |
|---------------------|-------------|--------------------------------------|
| Functionality       | Pass/Fail   | Does it do what was requested?       |
| Error Handling      | Pass/Fail   | What happens on failure?             |
| Reversibility       | Easy/Hard   | Can we undo this?                    |
| Blast Radius        | Low/Med/High| What else does this affect?          |
| Test Coverage       | Yes/No      | Are there tests? Do they pass?       |
| Security            | Safe/Risky  | Any OWASP top-10 concerns?          |
| Readability         | Good/Poor   | Is the code clear and commented?     |
| Dependencies Added  | None/List   | Any new libraries? Why?              |
| Performance Impact  | None/Some   | Does this slow anything down?        |
| Confidence Level    | Low/Med/High| How sure am I this is correct?       |
```

Below the scorecard, include:
- **Plain English Summary**: What this change does in one paragraph
- **What Could Go Wrong**: Top 3 failure scenarios
- **Verification Method**: How the orchestrator can confirm it works

## When Quality Gates Reveal Problems

If any check fails:
1. Do NOT declare the task complete
2. Fix the issue
3. Re-run the quality check
4. If the fix requires a Tier 3+ change, get approval first

## After Quality Gates Pass

State: "Quality gates passed. [Brief summary of what was verified]."
