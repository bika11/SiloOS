# Custom Recipes Implementation

## Goal
30kg from silo 1, followed by 34 kilo from silo 3 then 3 kg from silo 2. All stored on Pi.

## Tasks
- [ ] Backend: Add `recipes` to `ble_bridge.py` and `config.json` → Verify: `cat config.json`
- [ ] Frontend: Sync `recipes` in `SiloManager.ts` → Verify: `console.log` on sync
- [ ] Core: Create `RecipeRunner.ts` for sequential logic → Verify: Mock test passes
- [ ] UI: Build `RecipeEditor.tsx` and integrate in `DashboardScreen.tsx` → Verify: Recipe UI works

## Done When
- [ ] Multi-silo recipes can be created, saved, and executed sequentially.
