import { NAV_ICONS } from '@/components/ui/icons';
import { visibleNavItems } from '@/lib/housekeeping/navItems';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

/**
 * Bottom-Navigation - EINE gemeinsame App fuer alle Rollen, Sichtbarkeit haengt ausschliesslich
 * von Rolle/Property-Berechtigung ab (kein separates Admin-Frontend, siehe app/admin/page.tsx):
 *  - normaler Housekeeper: Planung + Vorfall melden (Apartments/Statistik ausgeblendet, siehe
 *    "elevated" unten - Briefing "Vorfall melden")
 *  - "elevated" (Admin ODER Standortverantwortlich ODER Team Lead): zusaetzlich Apartments,
 *    Statistik bleibt zusaetzlich an managedProperties/Admin gebunden (unveraendert)
 *  - admin: zusaetzlich Team
 * "Regeln" ist bewusst KEIN gleichwertiger Hauptpunkt mehr (siehe SettingsSheet ueber den
 * Profil-Button im Header), "Extras" ist als Task-Typ/-Feld in die Aufgaben-Ansicht aufgegangen.
 * WICHTIG: diese Sichtbarkeit ist reine UI-Bequemlichkeit - jede tatsaechliche Aktion bleibt
 * server-seitig ueber role/properties/managedProperties abgesichert (siehe api/*.js).
 * Item-Liste/Filterung selbst lebt jetzt in lib/housekeeping/navItems.ts (Desktop-Admin-Layout,
 * Punkt 3) - dieselbe Quelle speist auch die neue Desktop-Seitennavigation (DesktopNavRail.tsx).
 * `xl:hidden` blendet diese Bottom-Navigation NUR ab 1280px aus, darunter unveraendert wie zuvor.
 */
export function StaffNavBar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, openReportMenu } = app;
  const items = visibleNavItems(app);

  return (
    <nav
      className="grid shrink-0 border-t border-line bg-warm-white pb-[max(env(safe-area-inset-bottom),0.5rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] xl:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = item.id !== 'melden' && item.id === state.activeNav;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => (item.id === 'melden' ? openReportMenu() : setActiveNav(item.id))}
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
