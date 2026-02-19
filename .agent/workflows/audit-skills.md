# /audit-skills — Skill Inventory Audit

Use periodically to review all skills, prune unused ones, and identify improvement opportunities. Type `/audit-skills`.

## Instructions

### Step 1: Inventory All Skills

List every skill in `.agent/skills/`, organized by origin:

**Core Ground Zero Skills** (shipped with the base layer):
| Skill | Purpose | Status |
|-------|---------|--------|
| bootstrap | Project onboarding and config generation | [active/unused] |
| skill-generator | Creates new skills | [active/unused] |
| rule-generator | Creates new rules | [active/unused] |
| code-explainer | Plain-English code explanations | [active/unused] |
| error-logger | Structured error logging | [active/unused] |
| decision-recorder | Architecture Decision Records | [active/unused] |

**Project-Generated Skills** (created by crystallization or bootstrap):
| Skill | Purpose | Created | Last Used | Success Rate |
|-------|---------|---------|-----------|--------------|
| [name] | [what it does] | [date] | [date] | [X/Y] |

### Step 2: Assess Each Project-Generated Skill

For each auto-generated skill, evaluate:
- **Usage frequency**: How often has it been triggered?
- **Success rate**: How often does it complete without errors?
- **Relevance**: Is it still relevant to the current project state?
- **Quality**: Is the SKILL.md well-written? Is the trigger description specific enough?

### Step 3: Recommendations

For each skill, recommend one of:
- **Keep**: Working well, actively used
- **Update**: Working but needs improvements (specify what)
- **Merge**: Overlaps with another skill — should be combined
- **Retire**: No longer relevant or never used — should be removed

### Step 4: Propose Improvements

Based on the audit:
- Are there gaps? (common operations that should be skills but are not)
- Are there conflicts? (skills that overlap or contradict each other)
- Are there quality issues? (vague descriptions, missing constraints)

### Step 5: Execute Approved Changes

If the orchestrator approves any removals or updates:
- Remove retired skill directories
- Update skills that need improvement
- Merge overlapping skills
- Log all changes to `.agent/knowledge/evolution-log.md`

## Important

- Never remove core Ground Zero skills (bootstrap, skill-generator, rule-generator, code-explainer, error-logger, decision-recorder)
- Always ask the orchestrator before removing or modifying any skill
- Explain in plain English why each recommendation is being made
