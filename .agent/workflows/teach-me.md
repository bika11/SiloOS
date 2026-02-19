# /teach-me — Learn a Programming Concept

Use when you encounter a concept you want to understand. Type `/teach-me` followed by the concept or question.

Examples:
- `/teach-me what is an API`
- `/teach-me how do loops work`
- `/teach-me what is async/await`
- `/teach-me why do we need a database`

## Instructions

### 1. Start With an Analogy
Before showing any code, explain the concept using a comparison to something from the physical world. Make it vivid and specific.

Example for "API":
> An API is like a waiter in a restaurant. You (the app) tell the waiter (the API) what you want from the menu. The waiter goes to the kitchen (the server/database), gets your order, and brings it back. You never go into the kitchen yourself — the waiter handles the communication.

### 2. Show the Simplest Possible Example
Write 3-5 lines of code that demonstrate the concept in its most basic form. Add a plain-English comment on every line.

```python
# Ask the weather service for today's forecast (this is an API call)
response = weather_api.get("today")

# The service sends back the answer
temperature = response["temperature"]

# Show it to the user
print(f"It is {temperature} degrees today")
```

### 3. Show Where This Concept Appears in THIS Project
Search the current project for real uses of this concept. For each one found:
- State the file path and line number
- Explain what it does in THIS specific context
- Explain why it was used here

If the concept does not appear in the current project, say so and explain when it might be used.

### 4. Explain WHY This Concept Exists
- What problem did programmers have before this concept existed?
- What would code look like without it?
- What makes it valuable?

### 5. Common Mistakes
List 2-3 common mistakes beginners make with this concept and how to avoid them.

### 6. Update Knowledge Files

**Glossary** (`.agent/knowledge/glossary.md`):
Add the term if not already present, using the format:
> **[Term]**: [One-sentence definition]. Like [analogy]. First encountered in [context]. Used because [reason].

**Learning Journal** (`docs/learning-journal.md`):
Add a dated entry:
```
### [DATE]: [Concept Name]
[Two-sentence summary of what was learned]
**Where encountered**: [file or context]
**Analogy**: [the analogy used]
```
