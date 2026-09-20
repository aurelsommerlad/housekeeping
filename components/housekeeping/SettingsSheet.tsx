'use client';

import { APP_VERSION } from '@/lib/housekeeping/api';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { RulesScreen } from './RulesScreen';
import { NfcSettingsScreen } from './NfcSettingsScreen';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface SettingsSheetProps {
  app: HousekeepingApp;
  open: boolean;
  onClose: () => void;
}

/**
 * Dezentes Profil-/Einstellungsmenue ueber den Profil-Button im Header - EINE gemeinsame App,
 * keine gleichwertige Bottom-Nav-Position mehr fuer selten benoetigte Funktionen. "Regeln"
 * (RulesScreen, unveraendert) ist von hier aus nur fuer Admins sichtbar, weil sie zuvor
 * ausschliesslich im admin-only Team-Screen erreichbar war - kein zusaetzlicher Zugriff, nur ein
 * anderer, weniger prominenter Ort dafuer.
 */
export function SettingsSheet({ app, open, onClose }: SettingsSheetProps) {
  const { state, t, setLang, doLogout } = app;
  const isAdmin = state.user?.role === 'admin';

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('profile_title')}</h3>

      <div className="mt-3 flex flex-col gap-0.5">
        <p className="font-medium text-ink">{state.user?.name}</p>
        <p className="text-[13px] text-muted">{state.user?.email || `@${state.user?.username}`}</p>
        <p className="text-[13px] text-muted">{state.user?.role === 'admin' ? t('role_admin') : t('role_housekeeper')}</p>
      </div>

      <div className="mt-5 flex flex-col gap-1.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{t('language_label')}</p>
        <div className="flex gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                'flex-1 rounded-control border px-3 py-2 text-[13px] font-semibold uppercase transition-colors',
                state.lang === l ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {isAdmin ? (
        <div className="mt-5 -mx-5 border-t border-line px-1 pt-4">
          <RulesScreen app={app} />
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mt-5 -mx-5 border-t border-line px-5 pt-4">
          <NfcSettingsScreen app={app} />
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-muted">v{APP_VERSION}</p>

      <Button variant="ghost" className="mt-3 w-full" onClick={doLogout}>
        {t('logout')}
      </Button>
      <Button variant="ghost" className="mt-1 w-full" onClick={onClose}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
