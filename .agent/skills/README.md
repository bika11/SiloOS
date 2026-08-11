# Skills Framework

Skills are reusable, domain-specific procedures that any agent can invoke when working on a task. 

## Structure

- [`project/`](file:///c:/Users/anbdk/SiloOS/.agent/skills/project/): Project-specific skills for SiloOS hardware and frontend.
- [`awesome/`](file:///c:/Users/anbdk/SiloOS/.agent/skills/awesome/): [Antigravity Awesome Skills](https://github.com/sickn33/antigravity-awesome-skills) library (850+ expert skills).

## How to Use

1. Reference a skill by name (e.g., `@brainstorming` from awesome, or `@ble-debug` from project).
2. The agent will read the relevant `SKILL.md` or `.md` file for instructions.
3. Follow the procedure and report results.

## Project Skills

| Skill | File | Domain | Purpose |
|-------|------|--------|---------|
| **Pi Recovery** | `../siloos-pi-recovery/SKILL.md` | Hardware/Network | **Start here for "not connecting"** — IP drift, dead ethernet link, rogue laptop mock, dual-stack |
| BLE Debug | `ble-debug.md` | Hardware | Debug BLE connection issues (after network is ruled out) |
| Ops / Deploy | `../siloos-ops/SKILL.md` | Hardware | Build, deploy, manage `scale_bridge` + `silo-dashboard` services |
| Dashboard Dev | `dashboard-dev.md` | Frontend | Develop dashboard features |
| Pi Deploy | `pi-deploy.md` | Hardware | Deploy code to Raspberry Pi |
| SFWU Protocol | `sfwu-protocol.md` | Protocol | Work with SFWU packets |
| Scale Calibration | `scale-calibration.md` | Hardware | Calibrate scale integration |
| Code Review | `code-review.md` | QA | Review code changes |

> **Incident lessons:** `.agent/LESSONS.md` distills hard-won lessons (e.g. the 2026-08-10 connectivity RCA). Read it before deep-diving a recurring failure.
>
> **Note:** newer canonical skills live in `siloos-*/SKILL.md` dirs; the older `project/*.md` copies are being consolidated into these.
