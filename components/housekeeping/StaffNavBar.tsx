import { NAV_ICONS } from '@/components/ui/icons';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { isElevatedHousekeepingUser, managedPropertyCodes } from '@/lib/housekeeping/permissions';
import type { HousekeepingApp, NavId } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { cn } from '@/lib/cn';

/** 'melden' ist bewusst KEIN eigener NavId/Screen (siehe useHousekeepingApp.ts#openReportMenu) -
 * ein Klick oeffnet ein kleines Auswahl-Sheet (ReportMenuSheet.tsx: "Vorfall melden"/"Verbrauch
 * melden") ueber dem aktuell sichtbaren Screen, statt die Tab-Auswahl zu wechseln (analog zu
 * anderen Sheets wie TaskDetailSheet). Punkt 14 "nicht einfach weitere Bottom-Nav-Punkte
 * hinzufuegen": beide Melde-Funktionen teilen sich diesen EINEN Punkt statt je einem eigenen.
 * 'nonElevated' zeigt ihn nur denjenigen, die "Apartments" NICHT sowieso schon haben (siehe
 * 'elevated' unten) - so wandert er fuer normale Housekeeper exakt in die frei gewordene
 * Apartments-Position, ohne fuer Admin/Standortverantwortliche/Lead einen fuenften, gleichwertigen
 * Bottom-Nav-Punkt zu erzeugen (die erreichen beide Funktionen stattdessen ueber Einstellungen
 * oder - "Vorfall melden" - direkt aus der Task-Detailansicht heraus, siehe TaskDetailSheet.tsx). */
const ITEMS: { id: NavId | 'melden'; icon: keyof typeof NAV_ICONS; labelKey: I18nKey; requires?: 'manager' | 'admin' | 'elevated' | 'nonElevated' }[] = [
  { id: 'tasks', icon: 'checklist', labelKey: 'nav_tasks' },
  { id: 'rooms', icon: 'bed', labelKey: 'nav_apartments', requires: 'elevated' },
  { id: 'melden', icon: 'alert', labelKey: 'nav_report_menu', requires: 'nonElevated' },
  { id: 'stats', icon: 'chart', labelKey: 'nav_stats', requires: 'manager' },
  { id: 'team', icon: 'users', labelKey: 'nav_team', requires: 'admin' },
];

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
 */
export function StaffNavBar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, openReportMenu } = app;
  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const isManagerAnywhere = isAdmin || managedPropertyCodes(state.user, allowed).length > 0;
  const elevated = isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code));
  const items = ITEMS.filter((i) => {
    if (i.requires === 'admin') return isAdmin;
    if (i.requires === 'manager') return isManagerAnywhere;
    if (i.requires === 'elevated') return elevated;
    if (i.requires === 'nonElevated') return !elevated;
    return true;
  });

  return (
    <nav
      className="grid shrink-0 border-t border-line bg-warm-white pb-[max(env(safe-area-inset-bottom),0.5rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
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
