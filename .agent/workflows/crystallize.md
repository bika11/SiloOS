# /crystallize — Create Skills From Patterns (The Foundry)

Use when you notice the agent repeating the same operations, or when you want to manually create a skill. Type `/crystallize` or `/crystallize [description of what to automate]`.

## Instructions

### Mode 1: Auto-Detect Patterns

If invoked without arguments (`/crystallize`):

1. **Scan** `.agent/knowledge/patterns.md` for entries with:
   - 2+ occurrences (suggest for review)
   - 3+ occurrences with >70% success rate (recommend crystallization)

2. **For each qualifying pattern**, present to the orchestrator:
   - "I have noticed I [description] repeatedly — [N] times so far."
   - "I can create a skill that automates this."
   - "It would work like this: [plain-English description of what the skill does]"
   - "Would you like me to create it?"

3. **If approved**: Use the `skill-generator` skill to create the new skill properly. Ensure:
   - SKILL.md has a specific trigger description
   - Instructions are clear and step-by-step
   - Edge cases are covered in constraints
   - Templates or scripts are created if needed

4. **Log** to `.agent/knowledge/evolution-log.md`:
   ```
   [DATE] TYPE: skill NAME: [skill-name]
     TRIGGER: Crystallized from pattern PATTERN-NNN (N occurrences)
     DESCRIPTION: [what the skill does]
     METRIC: Reduces [N] steps to [1] command
     STATUS: active
   ```

5. **Update** the pattern's crystallization status in `patterns.md` to "crystallized as [skill-name]"

### Mode 2: Manual Skill Request

If invoked with arguments (`/crystallize deploy to staging`):

1. **Understand the request**: What does the orchestrator want to automate?

2. **Check for existing skills**: Does something similar already exist in `.agent/skills/`?

3. **Design the skill**:
   - What trigger description will match this intent?
   - What steps does the skill need to perform?
   - What can go wrong and how to handle it?
   - Are scripts or templates needed?

4. **Present the design** to the orchestrator for approval before creating files

5. **Create** using the `skill-generator` skill

6. **Log** to `evolution-log.md`

## Report

After any crystallization, summarize:
- What was created and where (file paths)
- How it will trigger (what the orchestrator or agent says/does)
- The optimization metric: "This used to take [N] steps. Now it takes [1]."
