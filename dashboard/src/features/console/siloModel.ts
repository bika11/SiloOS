/**
 * Silo model for the console — a "silo" IS a machine drink (ParsedMenuItem):
 * siloId = drink.name, hardware key = drink.id. Inventory (preferences.inventory)
 * and learned profiles (getProfiles) are both keyed by siloId (= drink.name).
 * This module only READS + joins that existing data; it defines no new store.
 */
import { useEffect, useState } from 'react';
import type { SiloManager } from '../../bluetooth/SiloManager';
import type { ParsedMenuItem } from '../../entities/Menu';
import type { SiloProfile } from '../dosing/DoseController';
import type { SiloInventoryState } from '../settings/SiloInventory';

/** Hard target cap for the target stepper — matches DrinkCustomizer's GRAV_MAX_KG. */
export const MAX_TARGET_KG = 120;
/** Hopper gross cap for the gauge — mirrors safety.max_weight_kg / hopper_abort_kg. */
export const HOPPER_CAP_KG = 130;
/** Below this a silo is "low" (danger tint). */
export const LOW_SILO_KG = 5;

export interface ConsoleSilo {
  /** siloId (= drink.name), used for inventory/profile keys and dose siloId. */
  id: string;
  /** Machine drink id — the hardware order key. */
  menuId: number;
  title: string;
  lotName: string;
  lotId: string | null;
  currentKg: number | null;
  initialFillKg: number | null;
  profile: SiloProfile | null;
}

export function buildSilos(
  menuItems: ParsedMenuItem[],
  inventory: Record<string, SiloInventoryState>,
  profiles: Record<string, SiloProfile>,
): ConsoleSilo[] {
  return menuItems.map((item) => {
    const id = item.name;
    const inv = inventory[id];
    const profile = profiles[id] ?? null;
    return {
      id,
      menuId: item.id,
      title: item.name,
      lotName: inv?.lotName ?? '',
      lotId: inv?.lotId ?? null,
      currentKg: inv ? inv.currentCalculatedKg : null,
      initialFillKg: inv ? inv.initialFillKg : null,
      profile,
    };
  });
}

/**
 * Read-only silo list, refreshed on a light poll (preferences/profiles are
 * synced into SiloManager by the bridge; there's no push listener for either,
 * matching the existing SiloInventory 2 s poll).
 */
export function useSilos(siloManager: SiloManager, menuItems: ParsedMenuItem[]): ConsoleSilo[] {
  const [silos, setSilos] = useState<ConsoleSilo[]>(() =>
    buildSilos(
      menuItems,
      siloManager.getPreferences().inventory || {},
      siloManager.getProfiles() as Record<string, SiloProfile>,
    ),
  );

  useEffect(() => {
    const refresh = () => {
      setSilos(
        buildSilos(
          menuItems,
          siloManager.getPreferences().inventory || {},
          siloManager.getProfiles() as Record<string, SiloProfile>,
        ),
      );
    };
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [siloManager, menuItems]);

  return silos;
}
