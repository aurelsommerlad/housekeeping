import { NAV_ICONS } from '@/components/ui/icons';
import { allowedProperties } from './rooms';
import { isElevatedHousekeepingUser, managedPropertyCodes } from './permissions';
import type { HousekeepingApp, NavId } from './useHousekeepingApp';
import type { I18nKey } from './i18n';

export interface NavItemDef {
  id: NavId | 'melden';
  icon: keyof typeof NAV_ICONS;
  labelKey: I18nKey;
  requires?: 'manager' | 'admin' | 'elevated' | 'nonElevated';
}

/** Aus StaffNavBar.tsx ausgelagert (Desktop-Admin-Layout, Punkt 3: "keine neue Navigationslogik
 * bauen") - EINE Quelle fuer Routen/Sichtbarkeit, die sowohl die mobile Bottom Navigation
 * (StaffNavBar.tsx) als auch die neue Desktop-Seitennavigation (DesktopNavRail.tsx) verwenden.
 * Inhalt/Reihenfolge/Bedingungen 1:1 unveraendert aus StaffNavBar.tsx uebernommen. */
export const NAV_ITEMS: NavItemDef[] = [
  { id: 'tasks', icon: 'checklist', labelKey: 'nav_tasks' },
  { id: 'rooms', icon: 'bed', labelKey: 'nav_apartments', requires: 'elevated' },
  { id: 'melden', icon: 'alert', labelKey: 'nav_report_menu', requires: 'nonElevated' },
  { id: 'stats', icon: 'chart', labelKey: 'nav_stats', requires: 'admin' },
  { id: 'team', icon: 'users', labelKey: 'nav_team', requires: 'admin' },
];

/** Rein UI-Bequemlichkeit (siehe StaffNavBar.tsx-Kommentar) - jede tatsaechliche Aktion bleibt
 * server-seitig ueber role/properties/managedProperties abgesichert (api/*.js). */
export function visibleNavItems(app: HousekeepingApp): NavItemDef[] {
  const { state } = app;
  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const isManagerAnywhere = isAdmin || managedPropertyCodes(state.user, allowed).length > 0;
  const elevated = isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code));
  return NAV_ITEMS.filter((i) => {
    if (i.requires === 'admin') return isAdmin;
    if (i.requires === 'manager') return isManagerAnywhere;
    if (i.requires === 'elevated') return elevated;
    if (i.requires === 'nonElevated') return !elevated;
    return true;
  });
}
