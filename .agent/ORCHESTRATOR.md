# SiloOS Multi-Agent Orchestration System

## Purpose
This document is the central coordination point for all AI agents working on SiloOS. Any agent joining the project MUST read this file first.

## System Overview

```
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR (this file)            │
│  Central coordination, roles, routing            │
├─────────┬───────────┬───────────┬───────────────┤
│ STATUS  │  TASKS    │  SKILLS   │  WORKFLOWS    │
│ .md     │  .md      │  /skills  │  /workflows   │
│ Health  │  Backlog  │  Reusable │  Step-by-step │
│ Metrics │  Priority │  Actions  │  Procedures   │
└─────────┴───────────┴───────────┴───────────────┘
         ▼           ▼           ▼
   ┌──────────────────────────────────────┐
   │            AGENT ROLES               │
   │  frontend / hardware / protocol / qa │
   │  See: .agent/agents/                 │
   └──────────────────────────────────────┘
```

## How It Works

### 1. Agent Onboarding
When any AI agent starts working on SiloOS:
1. Read `CLAUDE.md` (project root) for project overview
2. Read this file (`ORCHESTRATOR.md`) for the collaboration system
3. Read `STATUS.md` for current project health
4. Read `TASKS.md` for the prioritized backlog
5. Identify which **agent role** matches the current task
6. Read the relevant **skill files** for domain knowledge
7. Follow the relevant **workflow** for the task type

### 2. Agent Roles
Each agent should operate within a defined role. See `.agent/agents/` for full role definitions.

| Role | Domain | Key Files |
|------|--------|-----------|
| **Frontend Agent** | React, TypeScript, UI/UX, Vite | `dashboard/src/` |
| **Hardware Agent** | Raspberry Pi, BLE, RS485, Python | `ble_bridge.py`, `config.json` |
| **Protocol Agent** | SFWU, CRC32, binary parsing | `dashboard/src/sfwu/` |
| **QA Agent** | Testing, code review, auditing | All files |

### 3. Conflict Resolution
When multiple agents work concurrently:
- **File Ownership**: Each agent should claim files in `TASKS.md` before editing
- **Merge Strategy**: Frontend and hardware changes are independent; protocol changes require coordination
- **Communication**: Update `STATUS.md` after completing any task
- **Handoff Protocol**: When passing work to another agent, create a task in `TASKS.md` with full context

### 4. Decision Authority
- **Frontend Agent**: UI layout, component structure, CSS, React patterns
- **Hardware Agent**: Pi configuration, BLE parameters, serial settings, deployment
- **Protocol Agent**: SFWU packet structure, CRC, parser logic, command format
- **QA Agent**: Can flag issues in any domain, creates tasks for the responsible agent
- **Escalation**: Cross-domain decisions (e.g., WebSocket API changes) require updating both sides and noting in `STATUS.md`

## File System Map

```
.agent/
├── ORCHESTRATOR.md      ← You are here (start point for all agents)
├── STATUS.md            ← Live project health and monitoring
├── TASKS.md             ← Prioritized task board
├── rules.md             ← Maintenance rules and constraints
│
├── agents/              ← Agent role definitions
│   ├── README.md        ← How agent roles work
│   ├── frontend.md      ← Frontend specialist config
│   ├── hardware.md      ← Hardware/Pi specialist config
│   ├── protocol.md      ← SFWU protocol specialist config
│   └── qa.md            ← Testing/QA specialist config
│
├── skills/              ← Reusable skill definitions
│   ├── README.md        ← How to create and use skills
│   ├── ble-debug.md     ← BLE debugging procedures
│   ├── dashboard-dev.md ← Dashboard development patterns
│   ├── pi-deploy.md     ← Raspberry Pi deployment
│   ├── sfwu-protocol.md ← SFWU protocol reference
│   ├── scale-calibration.md ← Scale integration
│   └── code-review.md   ← Code review checklist
│
└── workflows/           ← Step-by-step procedures
    ├── sync-project.md  ← Sync local ↔ Pi
    ├── feature-dev.md   ← New feature development
    ├── bug-fix.md       ← Bug investigation & fix
    ├── deploy.md        ← Production deployment
    └── audit.md         ← Project audit procedure
```

## Conventions

### Status Updates
After completing any significant work, update `STATUS.md`:
```markdown
## Latest Update
- **Date**: YYYY-MM-DD
- **Agent**: [role]
- **Change**: Brief description
- **Files Modified**: list
- **Status**: working | broken | needs-review
```

### Task Format
Tasks in `TASKS.md` follow this format:
```markdown
### [TASK-ID] Title
- **Priority**: P0 (critical) | P1 (high) | P2 (medium) | P3 (low)
- **Agent**: frontend | hardware | protocol | qa | any
- **Status**: open | in-progress | review | done
- **Description**: What needs to be done
- **Acceptance Criteria**: How to verify it's done
- **Dependencies**: Other task IDs this depends on
```

### Skill Invocation
Skills are referenced by name in workflows and tasks:
```markdown
Execute skill: `ble-debug` with context: "TopBrewer not responding"
```
