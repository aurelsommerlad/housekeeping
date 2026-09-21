'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isAdmin, isElevatedHousekeepingUser } from '@/lib/housekeeping/permissions';
import { BottomSheet } from './BottomSheet';
import { LanguagePicker } from './LanguagePicker';
import { Button } from '@/components/ui/Button';

export interface SettingsSheetProps {
  app: HousekeepingApp;
  open: boolean;
  onClose: () => void;
}

interface MenuRowProps {
  label: string;
  onClick: () => void;
}

function MenuRow({ label, onClick }: MenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="py-2.5 text-left text-[15px] text-ink transition-colors hover:text-sage"
    >
      {label}
    </button>
  );
}

/**
 * Dezentes Profil-/Schnellmenue ueber den Profil-Button im Header - EINE gemeinsame App, kein
 * separates Admin-Backend (siehe Briefing). Enthaelt bewusst nur den zentralen Einstieg
 * ("Einstellungen" -> SettingsScreen, "Team" -> Team-Tab) plus Sprache/Abmelden; Regeln, NFC-Tags
 * und Standardzeiten leben ausschliesslich in SettingsScreen (keine Duplikate mehr hier).
 */
export function SettingsSheet({ app, open, onClose }: SettingsSheetProps) {
  const { state, t, doLogout, setActiveNav } = app;
  const admin = isAdmin(state.user);
  // Punkt "Team-Lead-Zugriff reparieren": ein Team-Verantwortlicher (oder ein Standort-
  // verantwortlicher wie im Briefing "Vorfall melden" - beide behalten Apartments in der Bottom-
  // Nav, siehe StaffNavBar.tsx) ist kein Admin, braucht aber trotzdem Zugang zu SettingsScreen
  // (dort liegen "Reinigungsfirmen & Teams" und der "Vorfall melden"-Einstieg ohne Vorauswahl) -
  // vorher war dieser Einstieg hier hart auf role==='admin' beschraenkt. "Team & Berechtigungen"
  // (die volle Mitarbeiterverwaltung) bleibt bewusst admin-only, siehe unten.
  const elevated = isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code));

  function goTo(nav: 'settings' | 'team') {
    setActiveNav(nav);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('profile_title')}</h3>

      <div className="mt-3 flex flex-col gap-0.5">
        <p className="font-medium text-ink">{state.user?.name}</p>
        {admin ? <p className="text-[13px] text-muted">{t('role_admin_full')}</p> : null}
      </div>

      {elevated ? (
        <div className="mt-4 flex flex-col divide-y divide-line border-y border-line">
          <MenuRow label={t('settings_title')} onClick={() => goTo('settings')} />
          {admin ? <MenuRow label={t('settings_team_row')} onClick={() => goTo('team')} /> : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-1.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{t('language_label')}</p>
        <LanguagePicker app={app} />
      </div>

      <Button variant="ghost" className="mt-5 w-full" onClick={doLogout}>
        {t('logout')}
      </Button>
      <Button variant="ghost" className="mt-1 w-full" onClick={onClose}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
