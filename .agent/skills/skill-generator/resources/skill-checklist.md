# Skill Quality Checklist

Before finalizing any new skill, verify every item:

## Frontmatter
- [ ] `name` is lowercase, hyphenated, max 64 characters
- [ ] `description` is specific enough to trigger on the right user intent
- [ ] `description` would NOT trigger on unrelated user intents (test mentally: "if the user says X, would this trigger? Should it?")

## Instructions
- [ ] Each step is clear and can be followed without ambiguity
- [ ] Steps are in the correct order — no step depends on a later step
- [ ] Instructions reference supporting files by correct relative path
- [ ] Error scenarios are addressed (what if a command fails?)

## For the Orchestrator
- [ ] The skill name makes sense in plain English
- [ ] A non-programmer can understand what this skill does from reading the Goal section
- [ ] The constraints section is honest about limitations

## Duplication Check
- [ ] No existing skill in `.agent/skills/` does the same thing
- [ ] This skill does not overlap significantly with any workflow in `.agent/workflows/`
- [ ] If similar skills exist, this one is clearly differentiated

## Safety
- [ ] The skill does not modify core Ground Zero files (rules 00-06, core skills)
- [ ] If the skill runs commands, it handles errors properly
- [ ] If the skill modifies files, it respects the Trust Tier system
- [ ] No hardcoded secrets, paths, or environment-specific values
