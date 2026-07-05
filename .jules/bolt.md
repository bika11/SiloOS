## 2026-07-05 - Memoization of Array.filter with Array.includes in render loops
**Learning:** Found an O(N*M) filtering operation inside a render body in React which triggers unneeded re-renders. A large Set generation and multiple O(M) checks in every 50ms tick from emergency abort components forces unnecessary child renders.
**Action:** Extract filtering to a useMemo hook and construct a Set for O(1) lookups to avoid O(N*M) performance drops.
