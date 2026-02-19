# Evolution Observer

This rule is the engine of self-improvement. It runs continuously — after every completed task, you MUST perform this evaluation before declaring the task done.

## After Every Completed Task, Evaluate:

### 1. Repetition Check

Did I run the same sequence of commands or perform the same multi-step operation 2 or more times this session?

- **If YES**: Log to `.agent/knowledge/patterns.md` with:
  - A short description of the pattern
  - The exact command sequence
  - Which parts are variable (change each time)
  - Set occurrence count and crystallization status to "tracking"

- If a pattern already exists in `patterns.md`, increment its occurrence count. If it reaches 3+ occurrences with >70% success rate, change status to "ready" and proceed to the Crystallization Proposal below.

### 2. Learning Check

Did I discover a project convention, an undocumented behavior, a configuration detail, or a "gotcha" that was not previously recorded?

- **If YES**: Log to `.agent/knowledge/lessons.md` as a lesson (even if it is not an error — lessons include discoveries, not just failures)

### 3. Failure Check

Did something fail during this task? Did I recover from it?

- **If YES**: This should already be handled by the Error Protocol (rule 03). Verify that a lesson was logged. If not, log it now.

### 4. Crystallization Proposal

Does `.agent/knowledge/patterns.md` have any pattern marked "ready" (3+ occurrences, >70% success)?

- **If YES**: Propose a new skill to the orchestrator:
  - "I have noticed that I [description of pattern] repeatedly. I have done this [N] times across [N] sessions."
  - "I can create a skill that automates this. It would work like this: [plain-English description]."
  - "Should I create this skill? (You can say 'yes', 'not yet', or 'never for this pattern')"
  - If approved: use the `skill-generator` skill to create it properly, then log to `evolution-log.md`
  - If "never": mark the pattern as "rejected" in `patterns.md`

### 5. Preference Check

Did the orchestrator correct me, express a preference, or reject an approach during this task?

- **If YES**: Propose a rule update:
  - "You mentioned that you prefer [X over Y]. Should I add this as a permanent rule so I always follow this preference?"
  - If approved: use the `rule-generator` skill to create it, then log to `evolution-log.md`

### 6. Glossary Check

Did I use any technical terms that the orchestrator might not know?

- **If YES**: Check `.agent/knowledge/glossary.md`. If the term is not there, add it with a plain-English definition and an analogy.

## Important Constraints

- **Never auto-create skills, rules, or workflows without asking first.** Always propose and wait for approval.
- Keep the evaluation brief. If nothing noteworthy happened, just confirm: "Evolution check complete — no new patterns or lessons this task."
- Do not let the evolution check slow down the work. If the orchestrator is in a flow, save the evaluation notes and present them at the end of the session (via `/reflect`).
