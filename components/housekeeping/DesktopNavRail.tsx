import type { ComponentType, SVGProps } from 'react';
import { IconGear, NAV_ICONS } from '@/components/ui/icons';
import { visibleNavItems } from '@/lib/housekeeping/navItems';
import { isAdmin } from '@/lib/housekeeping/permissions';
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
 *
 * Feinschliff Runde 8 (Punkt 6/7): zusaetzlicher "Einstellungen"-Punkt NUR fuer Admin, per
 * `mt-auto` an den unteren Rand der Leiste gedrueckt und durch eine feine Trennlinie leicht von
 * der operativen Hauptnavigation abgesetzt - routet auf denselben bestehenden `activeNav:
 * 'settings'`-Screen (SettingsScreen.tsx), keine zweite Einstellungs-Implementierung. Bewusst
 * NICHT Teil von `visibleNavItems()`/navItems.ts: diese Liste ist mit der mobilen StaffNavBar
 * geteilt, ein dortiger Eintrag wuerde also auch in der mobilen Bottom Navigation erscheinen -
 * die Aufgabe verlangt aber ausschliesslich einen NEUEN DESKTOP-Punkt, Mobile bleibt unveraendert.
 * Die Sichtbarkeit hier ist reine Client-UX (wie bei jedem anderen Nav-Eintrag) - die eigentliche
 * Absicherung bleibt serverseitig je Admin-Aktion in den jeweiligen api/*.js-Routen (siehe
 * lib/housekeeping/settingsNav.ts-Kommentar), hier wird keine neue Funktionalitaet eingefuehrt,
 * nur ein zusaetzlicher Einstiegspunkt zum bereits bestehenden, bereits abgesicherten Screen.
 */
function NavButton({
  icon: Icon, label, active, onClick,
}: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'mx-2 flex flex-col items-center gap-1 rounded-control px-1 py-2.5 text-[10.5px] font-medium transition-colors',
        active ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
      )}
    >
      <Icon width={19} height={19} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function DesktopNavRail({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, openReportMenu } = app;
  const items = visibleNavItems(app);
  const admin = isAdmin(state.user);

  return (
    <nav className="hidden xl:flex xl:w-24 xl:flex-col xl:items-stretch xl:gap-1 xl:overflow-y-auto xl:border-r xl:border-line xl:bg-warm-white xl:py-4 xl:[grid-column:1] xl:[grid-row:1/-1]">
      {items.map((item) => (
        <NavButton
          key={item.id}
          icon={NAV_ICONS[item.icon]}
          label={t(item.labelKey)}
          active={item.id !== 'melden' && item.id === state.activeNav}
          onClick={() => (item.id === 'melden' ? openReportMenu() : setActiveNav(item.id))}
        />
      ))}
      {admin ? (
        <>
          <div className="mx-4 mt-auto border-t border-line pt-1" />
          <NavButton
            icon={IconGear}
            label={t('settings_title')}
            active={state.activeNav === 'settings'}
            onClick={() => setActiveNav('settings')}
          />
        </>
      ) : null}
    </nav>
  );
}
