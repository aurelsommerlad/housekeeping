import { NAV_ICONS } from '@/components/ui/icons';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { managedPropertyCodes } from '@/lib/housekeeping/permissions';
import type { HousekeepingApp, NavId } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { cn } from '@/lib/cn';

const ITEMS: { id: NavId; icon: keyof typeof NAV_ICONS; labelKey: I18nKey; requires?: 'manager' | 'admin' }[] = [
  { id: 'tasks', icon: 'checklist', labelKey: 'nav_tasks' },
  { id: 'rooms', icon: 'bed', labelKey: 'nav_apartments' },
  { id: 'stats', icon: 'chart', labelKey: 'nav_stats', requires: 'manager' },
  { id: 'team', icon: 'users', labelKey: 'nav_team', requires: 'admin' },
];

/**
 * Bottom-Navigation - EINE gemeinsame App fuer alle Rollen, Sichtbarkeit haengt ausschliesslich
 * von Rolle/Property-Berechtigung ab (kein separates Admin-Frontend, siehe app/admin/page.tsx):
 *  - normaler Housekeeper: Planung + Apartments
 *  - Standortverantwortlich (managedProperties nicht leer): zusaetzlich Statistik (relevante
 *    Standortstatistik - StatsScreen ist bereits auf state.activeProperty beschraenkt, das
 *    wiederum ueber PropertyChips nur aus den eigenen erlaubten Properties waehlbar ist)
 *  - admin: zusaetzlich Team
 * "Regeln" ist bewusst KEIN gleichwertiger Hauptpunkt mehr (siehe SettingsSheet ueber den
 * Profil-Button im Header), "Extras" ist als Task-Typ/-Feld in die Aufgaben-Ansicht aufgegangen.
 * WICHTIG: diese Sichtbarkeit ist reine UI-Bequemlichkeit - jede tatsaechliche Aktion bleibt
 * server-seitig ueber role/properties/managedProperties abgesichert (siehe api/*.js).
 */
export function StaffNavBar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav } = app;
  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const isManagerAnywhere = isAdmin || managedPropertyCodes(state.user, allowed).length > 0;
  const items = ITEMS.filter((i) => {
    if (i.requires === 'admin') return isAdmin;
    if (i.requires === 'manager') return isManagerAnywhere;
    return true;
  });

  return (
    <nav
      className="grid shrink-0 border-t border-line bg-warm-white pb-[max(env(safe-area-inset-bottom),0.5rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = item.id === state.activeNav;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveNav(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-col items-center gap-1 pt-2.5 pb-1.5 text-[10.5px] font-medium transition-colors',
              active ? 'text-ink' : 'text-muted',
            )}
          >
            <Icon width={20} height={20} />
            {t(item.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
