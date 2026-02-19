# Decision Logging Protocol

Every significant technical choice must be recorded as an Architecture Decision Record (ADR). This creates a permanent trail of WHY things are the way they are — essential when you (or a future agent) return to this project months later.

## When to Create an ADR

Create an ADR when:
- Choosing between two or more libraries, frameworks, or tools
- Deciding on an architectural pattern (how code is structured)
- Making a trade-off (speed vs. safety, simplicity vs. flexibility, etc.)
- Changing an approach that was previously decided
- Removing or replacing a technology

Do NOT create an ADR for:
- Minor code style choices (these belong in rules)
- Bug fixes (these belong in lessons.md)
- Routine implementation details

## ADR Format

Create a new file in `.agent/knowledge/decisions/` named `ADR-NNN-short-title.md`:

```markdown
# ADR-NNN: [Title — What Was Decided]

## Status
[proposed | accepted | deprecated | superseded by ADR-NNN]

## Date
[YYYY-MM-DD]

## Context
[Plain-English description of the problem or need. What situation required a decision?
Write this so a non-programmer can understand it.]

## Decision
[What was decided. One or two sentences.]

## Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| [Alt 1] | [benefits] | [drawbacks] | [reason] |
| [Alt 2] | [benefits] | [drawbacks] | [reason] |

## Consequences

**Positive:**
- [What gets better because of this decision]

**Negative:**
- [What trade-offs or limitations this introduces]

**Risks:**
- [What could go wrong, and how we mitigate it]

## Related Decisions
- [Links to other ADRs this builds on or affects]
```

## Numbering

- Start at ADR-001 and increment sequentially
- Never reuse a number, even if the ADR is deprecated
- When an ADR is superseded, update the old one's status to "superseded by ADR-NNN"

## Present to Orchestrator

When creating an ADR, briefly explain it:
- "I chose [X] over [Y] because [reason]. I recorded this decision as ADR-NNN so we can reference it later."
