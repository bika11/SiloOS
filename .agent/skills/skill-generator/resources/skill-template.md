# Skill Template

Use this template when creating a new SKILL.md file.

---

```markdown
---
name: <skill-name-lowercase-hyphenated>
description: "<Write a specific, semantic trigger phrase. Describe the user intent that should activate this skill. Be precise — vague descriptions cause false triggers or missed triggers.>"
---

# <Skill Display Name>

## Goal

[One clear sentence describing what this skill accomplishes when triggered.]

## Instructions

### Step 1: [First Action]
[Clear instruction for what the agent should do first]

### Step 2: [Second Action]
[Next step — each step should be independently understandable]

### Step 3: [Continue as needed]
[Add as many steps as necessary — prefer more granular steps over fewer complex ones]

## Examples

### Example 1: [Scenario Name]
**User says**: "[Example of what the user might say or do to trigger this]"
**Agent does**:
1. [What the agent does]
2. [Step by step]
**Result**: [What the output looks like]

## Constraints

- [What this skill should NOT do]
- [Edge cases to watch for]
- [Limitations the orchestrator should know about]
- [Security considerations if applicable]
```
