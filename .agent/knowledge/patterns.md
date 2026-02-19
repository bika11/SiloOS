# Patterns Registry

This file tracks repeating operations — sequences of commands or actions that the agent performs multiple times. When a pattern reaches 3+ occurrences with a high success rate, it becomes a candidate for crystallization into a new skill.

## Format

```
### PATTERN-NNN: [Short Description]
- **Occurrences**: [count]
- **Success Rate**: [X/Y successful runs]
- **Sessions Seen In**: [list of dates]
- **Command Sequence**:
  1. [step 1]
  2. [step 2]
  3. [step 3]
- **Variable Parts**: [what changes each time — e.g., file names, branch names]
- **Crystallization Status**: [tracking | ready | crystallized as skill-name | rejected]
```

## Active Patterns

_No patterns logged yet. The evolution observer will add entries here as it detects repeating operations._
