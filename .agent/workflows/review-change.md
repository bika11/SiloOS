# /review-change — Quality Scorecard

Use before approving significant code changes. Type `/review-change` to get a full quality assessment of recent modifications.

## Instructions

### Step 1: Identify What Changed

List all files that were modified, created, or deleted in the current task. For each file, note what was changed and why.

### Step 2: Produce the Quality Scorecard

| Criteria | Rating | Explanation |
|----------|--------|-------------|
| **Functionality** | Pass / Fail | Does the change do what was requested? How was it verified? |
| **Error Handling** | Pass / Fail | What happens when things go wrong? Are errors caught and handled? |
| **Reversibility** | Easy / Moderate / Hard | Can we undo this change easily? What would reversal require? |
| **Blast Radius** | Low / Medium / High | How much of the project does this change affect? |
| **Test Coverage** | Yes / No / Partial | Are there tests? Do they pass? What is not tested? |
| **Security** | Safe / Concern | Any OWASP top-10 issues? Hardcoded secrets? Injection risks? |
| **Readability** | Good / Needs Work | Is the code clear? Are there comments where needed? |
| **New Dependencies** | None / [List them] | Were any new libraries added? Why? Are they trustworthy? |
| **Performance** | No Impact / Some Impact | Does this slow anything down? Use more memory? |
| **Confidence** | Low / Medium / High | How confident am I that this is correct and complete? |

### Step 3: Plain English Summary

Write one paragraph explaining what this change does, as if telling a friend over coffee. No code, no jargon.

### Step 4: What Could Go Wrong

List the top 3 things that could fail or cause problems because of this change:
1. [Scenario 1] — [how likely] — [how to detect it]
2. [Scenario 2] — [how likely] — [how to detect it]
3. [Scenario 3] — [how likely] — [how to detect it]

### Step 5: How to Verify

Tell the orchestrator exactly how to confirm the change works:
- What to look for in the app/terminal/browser
- What test to run
- What behavior should be different now
- What behavior should remain the same

### Step 6: Recommendation

State clearly:
- "I recommend **approving** this change because [reason]."
- OR "I recommend **holding** this change because [concern]. Here is what should be addressed first: [action items]."
