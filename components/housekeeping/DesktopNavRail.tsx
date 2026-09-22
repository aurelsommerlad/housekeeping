import { NAV_ICONS } from '@/components/ui/icons';
import { visibleNavItems } from '@/lib/housekeeping/navItems';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

/**
 * Desktop-Admin-Layout (Punkt 3): schmale vertikale Navigation links statt der mobilen Bottom
 * Navigation - nutzt exakt dieselbe Item-Liste/Rollenfilterung wie StaffNavBar.tsx (siehe
 * lib/housekeeping/navItems.ts#visibleNavItems), dieselben Icons und dieselbe setActiveNav()-
 * Aktion. Komplett unsichtbar unterhalb `xl` (`hidden xl:flex`) - auf Mobile bleibt ausschliesslich
 * die bestehende StaffNavBar sichtbar, hier entsteht keine zweite Navigationslogik.
 *
 * Feinschliff Runde 7 (Punkt 7): die Leiste ist minimal breiter (96px statt 80px, weiterhin
 * innerhalb des urspruenglich vorgesehenen ~80-100px-Rahmens) und die aktive Markierung ist jetzt
 * EINE ruhige, helle Flaeche um Icon+Label zusammen (statt nur einer kleinen Flaeche hinter dem
 * Icon allein) - bewusst weiterhin der zurueckhaltende `bg-surface`-Ton, keine schwarze/kraeftige
 * Markierung.
 */
export function DesktopNavRail({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, openReportMenu } = app;
  const items = visibleNavItems(app);

  return (
    <nav className="hidden xl:flex xl:w-24 xl:flex-col xl:items-stretch xl:gap-1 xl:overflow-y-auto xl:border-r xl:border-line xl:bg-warm-white xl:py-4 xl:[grid-column:1] xl:[grid-row:1/-1]">
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
              'mx-2 flex flex-col items-center gap-1 rounded-control px-1 py-2.5 text-[10.5px] font-medium transition-colors',
              active ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <Icon width={19} height={19} />
            <span className="truncate">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
