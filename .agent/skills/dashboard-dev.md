# Skill: Dashboard Development

## When to Use
- Adding new UI features to the React dashboard
- Modifying existing screens or components
- Working with the build pipeline (Vite, TypeScript, ESLint)

## Prerequisites
- Node.js installed on development machine
- `cd dashboard && npm install` completed
- Understanding of React 19 hooks and TypeScript strict mode

## Procedure

### Step 1: Understand the Component Tree
```
App.tsx (root — owns TopBrewerConnection)
├── DashboardScreen (main view)
│   ├── ScaleReadout (live weight)
│   ├── DrinkMenuScreen (menu items)
│   └── DrinkCustomizer (gravimetric dosing)
├── DiscoveryScreen (device discovery)
├── [SettingsScreen] (not yet implemented)
└── [OrderHistoryScreen] (not yet implemented)
```

### Step 2: Create/Modify Component
All feature components live in `dashboard/src/features/<feature-name>/`.

Pattern for new features:
```tsx
import { TopBrewerConnection } from '../bluetooth/TopBrewerConnection';

interface Props {
  connection: TopBrewerConnection;
}

export function MyFeature({ connection }: Props) {
  // Use connection.someMethod() for hardware interaction
  // Use connection.onSomeEvent() for reactive updates
  return <div>...</div>;
}
```

### Step 3: Wire into App.tsx
Add the component to `App.tsx`, passing `connection` as a prop.

### Step 4: Use the Logger
```tsx
import { logger } from '../utils/logger';
logger.info('MyFeature', 'Action description', { data });
```

### Step 5: Verify
```bash
cd dashboard
npm run dev -- --host    # Dev server
npm run build            # Production build check
npm run lint             # Lint check
```

## Expected Outcomes
- Component renders correctly
- TypeScript compiles with zero errors
- ESLint passes with zero warnings
- Feature works with live TopBrewer connection

## Troubleshooting

| Issue | Fix |
|-------|-----|
| HMR not working | Check `vite.config.ts` HMR host setting |
| Type errors | Run `npx tsc --noEmit` for detailed errors |
| Import not found | Check relative path, verify barrel exports |
| WebSocket fails | Verify Pi bridge is running, check auth token |
