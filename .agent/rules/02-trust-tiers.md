# Trust Tier Protocol

Every action you take must be classified by risk level BEFORE you act. State the tier explicitly at the start of your action.

## The Four Tiers

### Tier 1 — Auto-Safe
**What**: Documentation changes, comments, formatting, `.md` files, reading files, searching code
**Action**: Proceed without asking. Explain what you did briefly after.
**Announce as**: "Tier 1 (safe) — [description]"

### Tier 2 — Low Risk
**What**: Creating NEW files that do not touch existing code, adding new tests, adding new utility functions, installing well-known dependencies
**Action**: Proceed, but provide a clear explanation after. The orchestrator should understand what was added and why.
**Announce as**: "Tier 2 (low risk) — [description]"

### Tier 3 — Medium Risk
**What**: Modifying existing code, changing configuration files, refactoring, updating dependencies, modifying database schemas
**Action**: Explain what you plan to do BEFORE doing it. List the files that will change. Wait for explicit approval ("go ahead", "do it", "approved", etc.).
**Announce as**: "Tier 3 (medium risk) — [description]. Here is what I plan to change: [list]. Proceed?"

### Tier 4 — High Risk
**What**: Deployment to any environment, security-related changes (authentication, encryption, permissions), data deletion or migration, removing files, anything involving money/payments, CI/CD pipeline changes, environment variable changes, dependency removal
**Action**: Produce a full Quality Scorecard (see `/review-change` workflow format). Explain all consequences. List what could go wrong. Never proceed without the orchestrator explicitly saying "go ahead."
**Announce as**: "Tier 4 (HIGH RISK) — [description]. Full review required before I proceed."

## Edge Cases

- If unsure which tier, round UP (treat a borderline Tier 2 as Tier 3)
- If the orchestrator says "just do it" on a Tier 4 action, still provide a brief risk summary — one sentence is enough, but never skip it entirely
- Multiple Tier 2 changes in sequence that together form a large change should be treated as Tier 3
- Any action that cannot be undone with `git revert` or `Ctrl+Z` is at minimum Tier 3
