# /onboard — Project Onboarding

First-contact analysis for any project. Run this once when opening a new or existing project for the first time.

## Instructions

### Step 1: Determine Project Type

Check what exists in the workspace beyond the Ground Zero base layer (`.agent/`, `GEMINI.md`, `docs/`, `README.md`):

- **No other files** → This is a **NEW project**. Go to "New Project Flow."
- **Other source files exist** → This is an **EXISTING project**. Go to "Existing Project Flow."

---

### New Project Flow

1. **Ask the orchestrator**:
   - "What do you want to build?" (get a description)
   - "What platform?" (web app, mobile, API, desktop, CLI — or should I recommend?)
   - "Any technology preferences?" (language, framework — or should I recommend?)
   - "Any must-have requirements?" (specific services, integrations, constraints)

2. **Recommend a tech stack** if the orchestrator does not have preferences:
   - Explain each technology choice in plain English
   - Explain WHY you recommend it (and what the alternatives were)
   - Wait for approval before proceeding

3. **Create a decision record** for the tech stack choice (ADR-001)

4. **Generate project-specific configuration**:
   - Create a code style rule in `.agent/rules/` matching the chosen stack
   - Create an architecture rule in `.agent/rules/` for the chosen patterns
   - Create skills for: build, test, run/start, lint (based on the stack)
   - Update `.agent/knowledge/tech-stack.md` with chosen technologies
   - Update `.agent/knowledge/project-map.md` with the planned structure
   - Add framework-specific terms to `.agent/knowledge/glossary.md`

5. **Log everything** to `.agent/knowledge/evolution-log.md`

6. **Report to orchestrator**: Summary of everything generated, what each file does, and suggested next steps.

---

### Existing Project Flow

1. **Scan the directory tree** — list all top-level directories and note what they likely contain

2. **Detect the tech stack** — use the bootstrap skill's checklist and signature files:
   - Read package manager files (package.json, requirements.txt, etc.)
   - Read framework config files
   - Read CI/CD configuration
   - Read test configuration

3. **Sample source code** — read 10-15 representative files to detect:
   - Coding style (indentation, naming, quotes, semicolons)
   - Architecture patterns (component structure, file organization)
   - Common patterns (error handling, validation, logging)
   - Test patterns (naming, framework, assertion style)

4. **Read existing documentation** — README, CONTRIBUTING, any docs/ files

5. **Generate project-specific configuration**:
   - Rules matching detected code style
   - Rules matching detected architecture conventions
   - Skills for detected commands (build, test, lint, deploy)
   - Update `.agent/knowledge/tech-stack.md`
   - Update `.agent/knowledge/project-map.md` with directory descriptions
   - Add project-specific terms to `.agent/knowledge/glossary.md`

6. **Log everything** to `.agent/knowledge/evolution-log.md`

7. **Report to orchestrator**:
   - What technologies were detected (with confidence levels)
   - What the project structure looks like (plain English)
   - What rules and skills were generated
   - Any concerns or observations (outdated dependencies, missing tests, etc.)
   - Suggested next steps

---

## After Onboarding

Remind the orchestrator:
- "Your project is now configured. The agent will follow the generated rules in all future sessions."
- "You can type `/health-check` anytime to see the project status."
- "As we work together, I will propose new skills and rules based on patterns I observe."
