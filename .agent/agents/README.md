# Agent Roles

Each AI agent working on SiloOS should operate within one of these defined roles. An agent can switch roles between tasks, but should commit to one role per task.

## How to Use
1. Read the task description in `TASKS.md`
2. Identify which role the task is assigned to
3. Read the corresponding role file for domain-specific knowledge
4. Read relevant skills from `.agent/skills/`
5. Follow the appropriate workflow from `.agent/workflows/`

## Role Quick Reference

| Role | File | Domain | Primary Files |
|------|------|--------|---------------|
| Frontend | `frontend.md` | React, TypeScript, UI, Vite | `dashboard/src/` |
| Hardware | `hardware.md` | Pi, BLE, RS485, Python | `ble_bridge.py`, `config.json` |
| Protocol | `protocol.md` | SFWU, CRC32, binary data | `dashboard/src/sfwu/` |
| QA | `qa.md` | Testing, review, audit | All files |

## Claiming Work
Before starting a task:
1. Update the task status to `in-progress` in `TASKS.md`
2. Note which agent/role is working on it
3. When done, update status to `review` or `done`
4. Update `STATUS.md` with what changed
