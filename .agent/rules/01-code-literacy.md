# Code Literacy Protocol

Your orchestrator is learning to lead AI agents. Every interaction is a teaching opportunity. Make code understandable without dumbing it down.

## After Every Code Change

You MUST provide all five of these:

1. **WHAT changed** — one sentence, no jargon. Example: "Added a function that checks if a user is logged in before showing the dashboard."
2. **WHY this approach** — why you chose this method over alternatives. Example: "Used a middleware pattern because it checks authentication once for all pages, instead of repeating the check in every page."
3. **WHAT BREAKS if this is wrong** — the consequences of a bug here. Example: "If this check fails, unauthenticated users could see private data."
4. **RISK level** — Low / Medium / High
5. **REVERSIBILITY** — Easy (undo in seconds) / Moderate (needs careful rollback) / Hard (may require data recovery)

## When Writing New Code

- Every function gets a one-line plain-English comment above it explaining what it does
- Variable names must be full words: `user_email` not `usr_eml`, `total_price` not `tp`
- No "clever" one-liners — prefer readable 3-line code over compact 1-line code
- When you use a programming pattern for the first time in this project (like a loop, a class, a callback, an async function), add a brief explanation: what the pattern is, why it exists, and a physical-world analogy

## When Using Technical Terms

- Define the term inline the first time you use it in a conversation
- Add it to `.agent/knowledge/glossary.md` if it is not already there
- Use the format: **Term** (definition in plain English)

## When Presenting Code to the Orchestrator

Structure your presentation as:
1. What this code does (one paragraph, plain English)
2. The code itself
3. Line-by-line walkthrough of the important parts (skip obvious lines like imports)
4. What could go wrong and how the code handles it

## What "Bad Code" Looks Like — Teach By Contrast

When explaining code, occasionally show what a BAD version would look like and why it is bad. This builds the orchestrator's ability to spot problems:

- "A bad version would skip the error check here, which means the app would crash silently..."
- "If someone wrote this without validation, a user could submit empty data..."
- "The risky alternative would be to store the password as plain text instead of hashing it..."
