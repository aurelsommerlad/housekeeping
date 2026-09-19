'use client';

import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

const LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO' };

/**
 * Kompakter Header (Briefing Punkt 3): Marke bleibt klein, dafuer traegt der Header die fuer den
 * Arbeitstag relevanten Infos - aktuelles Haus, Datum, angemeldete Person, Sprache. Bewusst zwei
 * schmale Zeilen statt einer grossen, um auf dem Smartphone moeglichst viel Platz fuer den
 * eigentlichen Inhalt zu lassen.
 */
export function StaffHeader({ app }: { app: HousekeepingApp }) {
  const { state, t, setLang, doLogout, toggleBreak } = app;
  const activeProperty = state.properties.find((p) => p.code === state.activeProperty);
  const dateLabel = new Intl.DateTimeFormat(LOCALES[state.lang] || 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date());

  return (
    <header className="shrink-0 border-b border-line bg-warm-white px-4 pt-[max(env(safe-area-inset-top),0.5rem)]">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="min-w-0 leading-none">
          <p className="brand-wordmark text-[10px] font-semibold tracking-[0.18em] text-muted">UNIQUE PLACES</p>
          <p className="mt-1 truncate text-[15px] font-medium text-ink">{activeProperty?.name || t('select_property')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.user?.role !== 'admin' ? (
            <button
              type="button"
              onClick={toggleBreak}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors',
                state.onBreak ? 'border-status-attention/30 bg-status-attention-bg text-status-attention' : 'border-line bg-warm-white text-muted',
              )}
            >
              {state.onBreak ? t('break_end') : t('break_start')}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t('logout')}
            onClick={doLogout}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            ⎋
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pb-2 text-[12px] text-muted">
        <span className="truncate">{state.user?.name} · {dateLabel}</span>
        <div className="flex shrink-0 gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase transition-colors',
                state.lang === l ? 'bg-ink text-warm-white' : 'text-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
