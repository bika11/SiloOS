# Evolution Log

This file records every self-improvement the system makes — new skills created, rules added, workflows generated. Nothing evolves without being logged here.

## Format

```
[DATE] TYPE: [skill|rule|workflow] NAME: [name]
  TRIGGER: What caused this evolution
  DESCRIPTION: What it does (plain English)
  METRIC: What it improves (e.g., "Reduced 5 steps to 1 command")
  STATUS: [proposed|approved|active|retired]
```

## Log Entries

[2026-02-19] TYPE: skill NAME: siloos-ops
  TRIGGER: /onboard workflow for SiloOS
  DESCRIPTION: Unified operations skill for building, linting, and syncing the SiloOS project.
  METRIC: Centralized multi-step operations into a single skill.
  STATUS: active

[2026-02-19] TYPE: rule NAME: silveros-coding-style
  TRIGGER: /onboard workflow for SiloOS
  DESCRIPTION: Enforces TypeScript and Python coding standards found in project samples.
  METRIC: Guards against style drift in a multi-language codebase.
  STATUS: active

[2026-02-19] TYPE: rule NAME: silveros-architecture
  TRIGGER: /onboard workflow for SiloOS
  DESCRIPTION: Enforces feature-based frontend structure and SFWU protocol isolation.
  METRIC: Prevents architectural regression and logic leaking.
  STATUS: active

[2026-02-19] TYPE: skill NAME: siloos-ble-debug
  TRIGGER: /audit-skills workflow for SiloOS
  DESCRIPTION: Formalized standalone BLE debugging steps into a standard skill.
  METRIC: Improved discoverability and automation of BLE troubleshooting.
  STATUS: active

[2026-02-19] TYPE: skill NAME: siloos-sfwu-protocol
  TRIGGER: /audit-skills workflow for SiloOS
  DESCRIPTION: Formalized protocol reference and parsing steps into a standard skill.
  METRIC: Centralized protocol knowledge for safer modifications.
  STATUS: active

[2026-02-19] TYPE: skill NAME: siloos-scale-calibration
  TRIGGER: /audit-skills workflow for SiloOS
  DESCRIPTION: Formalized scale calibration and wiring steps into a standard skill.
  METRIC: Ensures consistent scale integration across systems.
  STATUS: active

[2026-02-19] TYPE: skill NAME: siloos-code-review
  TRIGGER: /audit-skills workflow for SiloOS
  DESCRIPTION: Formalized multi-agent code review checklist into a standard skill.
  METRIC: Automates quality gates before deployment.
  STATUS: active

[2026-02-19] TYPE: skill NAME: siloos-ops (v2)
  TRIGGER: /audit-skills workflow for SiloOS
  DESCRIPTION: Consolidated deployment and development procedures into the ops skill.
  METRIC: Reduced multiple standalone deployment files into one hub.
  STATUS: active
[2026-02-19] TYPE: workflow NAME: onboard
  TRIGGER: User request to run /onboard
  DESCRIPTION: Completed full project analysis, detected tech stack (React 19, Python 3.11), and confirmed project stability.
  METRIC: Verified codebase readiness for UI improvements.
  STATUS: active
