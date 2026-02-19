# /health-check — Project Status Report

Use anytime to get a snapshot of the project's overall health, progress, and system status. Type `/health-check`.

## Instructions

Generate a report with these sections:

### 1. Project Overview
- What this project is (from `project-map.md`)
- Current development status (early stage, in progress, production-ready)
- Tech stack (from `tech-stack.md`)

### 2. Recent Activity
- Summarize the last 3-5 significant changes or tasks completed
- Note any work currently in progress

### 3. Lessons & Known Issues
Read `.agent/knowledge/lessons.md` and report:
- Total lessons logged
- Any unresolved or recurring issues
- Most recent lesson learned
- Any critical severity items that need attention

### 4. Evolution Status
Read `.agent/knowledge/evolution-log.md` and `.agent/knowledge/patterns.md`:
- How many skills have been auto-generated?
- How many rules have been added since initial setup?
- Are there any patterns ready for crystallization (3+ occurrences)?
- Overall evolution trajectory (is the system improving?)

### 5. Skill Inventory
List all skills in `.agent/skills/`:
- Which are core Ground Zero skills vs. project-generated ones
- Brief description of each

### 6. Rule Inventory
List all rules in `.agent/rules/`:
- Which are core Ground Zero rules (00-06) vs. project-generated ones
- Brief description of each

### 7. Technical Debt & Concerns
Flag any issues noticed:
- Outdated dependencies
- Missing tests
- Security concerns
- Performance bottlenecks
- Code quality issues

### 8. Recommendations
Suggest 2-3 next steps:
- What should be worked on next?
- Are there any maintenance tasks needed?
- Are there patterns that should be crystallized?

## Output Format

Present this as a clean, scannable report. Use tables where appropriate. Keep each section to 3-5 bullet points maximum. The orchestrator should be able to read the entire report in under 2 minutes.
