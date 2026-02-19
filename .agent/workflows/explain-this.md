# /explain-this — Plain-Language Code Explanation

Use when you see code you do not understand. Select the code in the editor and type `/explain-this`.

## Instructions

Explain the selected code using this structure:

### 1. What It Does
One sentence. No jargon. If you use a technical term, put the definition in parentheses immediately after.

### 2. Step-by-Step Walkthrough
Number each meaningful line or block and explain what it does:
- Skip obvious lines (like blank lines or simple imports everyone would understand)
- For each step, explain the WHAT and the WHY
- Use present tense: "This line checks if..." not "This line checked if..."

### 3. Why It Exists
- What problem does this code solve?
- What would happen if we deleted it?
- What feature or behavior depends on it?

### 4. What It Connects To
- **Depends on**: What other files, functions, or libraries does this code need to work?
- **Depended on by**: What other parts of the project rely on this code?

### 5. Analogy
Compare this code to something from everyday life. Be specific and vivid. For example:
- A login function is like a bouncer at a club — checks your ID before letting you in
- A database query is like searching a library catalog — you describe what you want, and it finds the matching books
- Error handling is like a safety net under a trapeze — catches you when something goes wrong so the whole show does not stop

### 6. Quality Assessment

| Aspect | Rating | Explanation |
|--------|--------|-------------|
| Error handling | Good / Needs work | Does it handle what could go wrong? |
| Readability | Good / Needs work | Is it easy to follow? |
| Security | Safe / Concern | Any obvious vulnerabilities? |
| Naming | Clear / Confusing | Do variable/function names say what they do? |

### 7. What BAD Would Look Like
Show or describe what a poor version of this code would look like, and explain the difference. This helps build the orchestrator's ability to recognize quality:
- "A bad version would skip the null check, meaning the app crashes if no user is found..."
- "An insecure version would store the password in plain text instead of hashing it..."

### 8. Glossary Update
If any technical terms were used that are not yet in `.agent/knowledge/glossary.md`, add them now.
