# Skills Framework

Skills are reusable, domain-specific procedures that any agent can invoke when working on a task. They encode expert knowledge about specific subsystems.

## How to Use a Skill
1. A task or workflow references a skill by name (e.g., `skill: ble-debug`)
2. Read the skill file for step-by-step instructions
3. Follow the procedure, adapting to the specific context
4. Report results back in the task or STATUS.md

## How to Create a New Skill

Create a new `.md` file in this directory with this structure:

```markdown
# Skill Name

## When to Use
Describe the trigger conditions.

## Prerequisites
What must be true before running this skill.

## Procedure
Step-by-step instructions.

## Expected Outcomes
What success looks like.

## Troubleshooting
Common failure modes and fixes.
```

## Available Skills

| Skill | File | Domain | Purpose |
|-------|------|--------|---------|
| BLE Debug | `ble-debug.md` | Hardware | Debug BLE connection issues |
| Dashboard Dev | `dashboard-dev.md` | Frontend | Develop dashboard features |
| Pi Deploy | `pi-deploy.md` | Hardware | Deploy code to Raspberry Pi |
| SFWU Protocol | `sfwu-protocol.md` | Protocol | Work with SFWU packets |
| Scale Calibration | `scale-calibration.md` | Hardware | Calibrate scale integration |
| Code Review | `code-review.md` | QA | Review code changes |
