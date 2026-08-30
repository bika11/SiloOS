## 2024-05-18 - Avoid Logger Spam in Render Function
**Learning:** Placing side effects like `logger.debug()` inside the body of a React render function without memoization can cause severe log spam and impact performance, especially when the component handles high-frequency state updates like a 50ms hold-to-abort timer or machine status updates.
**Action:** Always wrap expensive calculations (like array filtering) and any associated side effects (like logging the result) in a `useMemo` hook, so they only execute when their dependencies actually change.
