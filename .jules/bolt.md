## 2026-08-17 - High-Frequency State Updates and Component Rendering
**Learning:** High-frequency state updates (like the 50ms interval on the E-STOP button in DashboardScreen) trigger constant re-renders. Unmemoized array filtering (O(n*m)) and inline functions within this component cause a cascade of expensive child component updates.
**Action:** Always strictly memoize derived state (`useMemo`) and callback props (`useCallback`), and wrap heavy child components (like `RecipesPanel` and `DrinkMenuScreen`) in `React.memo` when the parent component manages high-frequency interaction state.
