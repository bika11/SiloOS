# ADR Template

Use this template when creating Architecture Decision Records.

---

```markdown
# ADR-NNN: [Title — What Was Decided]

## Status
[proposed | accepted | deprecated | superseded by ADR-NNN]

## Date
[YYYY-MM-DD]

## Context

[Explain the situation that required a decision. Write this so someone who has never seen this project can understand it. Answer: What problem are we solving? Why does it matter? What constraints do we have?]

## Decision

[State the decision in one or two clear sentences. "We will use [X] for [purpose]."]

## Alternatives Considered

| Option | Pros | Cons | Why Not Chosen |
|--------|------|------|----------------|
| **[Chosen Option]** | [benefits] | [drawbacks] | **This is our choice** |
| [Alternative 1] | [benefits] | [drawbacks] | [why rejected] |
| [Alternative 2] | [benefits] | [drawbacks] | [why rejected] |
| Do nothing | No effort needed | [problems that persist] | [why status quo is not acceptable] |

## Consequences

### Positive
- [What gets better because of this decision]
- [What becomes possible that was not before]

### Negative
- [What trade-offs this introduces]
- [What limitations we accept]

### Risks
- [What could go wrong]
- [How we plan to mitigate each risk]

## Related Decisions
- [ADR-NNN: Related title] — [how it relates: "builds on," "supersedes," "conflicts with"]
- If none, write "This is an independent decision."
```
