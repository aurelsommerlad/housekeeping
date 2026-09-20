import { NAV_ICONS } from '@/components/ui/icons';
import type { HousekeepingApp, NavId } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { cn } from '@/lib/cn';

const ITEMS: { id: NavId; icon: keyof typeof NAV_ICONS; labelKey: I18nKey; adminOnly?: boolean }[] = [
  { id: 'rooms', icon: 'bed', labelKey: 'nav_rooms' },
  { id: 'doubleup', icon: 'layers', labelKey: 'nav_doubleup' },
  { id: 'stats', icon: 'chart', labelKey: 'nav_stats', adminOnly: true },
  { id: 'rules', icon: 'book', labelKey: 'nav_rules', adminOnly: true },
  { id: 'team', icon: 'users', labelKey: 'nav_team', adminOnly: true },
];

/**
 * Bottom-Navigation, auf das fuer Reinigungskraefte Notwendige reduziert (Briefing Punkt 14):
 * Admin-Funktionen (Statistik/Regeln/Team) erscheinen ausschliesslich fuer role==='admin' -
 * eine Housekeeping-Person sieht hier nur Zimmer + Extras.
 */
export function StaffNavBar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav } = app;
  const isAdmin = state.user?.role === 'admin';
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

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
