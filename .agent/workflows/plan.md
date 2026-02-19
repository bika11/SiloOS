# /plan — Structured Planning Before Implementation

Use before starting any complex task. Type `/plan [what you want to build or change]`. This forces thorough thinking before any code is written.

## Instructions

### Step 1: Understand the Request

Read the orchestrator's request carefully. If anything is unclear, ask clarifying questions BEFORE proceeding. Do not assume.

### Step 2: Research

Before proposing a plan, gather information:
- Search the codebase for relevant existing code, patterns, and conventions
- Read `.agent/knowledge/lessons.md` for relevant past errors
- Read `.agent/knowledge/decisions/` for relevant past decisions
- Check `.agent/knowledge/tech-stack.md` for technology constraints
- Check `.agent/knowledge/project-map.md` for where new code should live

### Step 3: Design the Plan

Present a structured plan:

```
## Goal
[One sentence: what are we trying to accomplish?]

## Approach
1. [Step 1 — what we will do first and why]
2. [Step 2 — what comes next]
3. [Step 3 — continue as needed]
...

## Files to Create or Modify
| File | Action | Trust Tier | Why |
|------|--------|------------|-----|
| [path] | Create / Modify / Delete | 1-4 | [reason] |

## Risks & Mitigations
- [Risk 1]: [How we will mitigate it]
- [Risk 2]: [How we will mitigate it]

## Dependencies
- [Anything that needs to be in place before we start]
- [Libraries to install, services to set up, etc.]

## Verification Strategy
- [How we will know the implementation works]
- [What tests to run or what to check manually]

## Estimated Complexity
[Simple (1-2 files) / Moderate (3-5 files) / Complex (5+ files)]
```

### Step 4: Wait for Approval

Present the plan and explicitly ask: "Does this plan look good? Should I adjust anything before I start building?"

Do NOT write any code until the orchestrator approves.

### Step 5: Execute with Tracking

Once approved:
- Work through the plan step by step
- Announce each step as you start it: "Starting step 2: [description]"
- If you discover something unexpected, STOP and update the plan before continuing
- Apply Trust Tier protocol for each action
