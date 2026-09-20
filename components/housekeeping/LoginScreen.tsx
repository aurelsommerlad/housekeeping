'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import { APP_VERSION } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Login-Bildschirm des Housekeeping-Bereichs - identisch zur Owner-Center-Login-Karte
 * (Wortmarke + Unterzeile ausserhalb, freistehende Karte mit grosszuegiger Rundung, kursive
 * Ueberschrift, kleine getrackte Feld-Labels, voll gerundete Felder/Button). Die im
 * Referenz-Screenshot sichtbare hellblaue Feldfuellung ist Browser-Autofill, kein Design-Token,
 * und wird bewusst NICHT uebernommen - Felder bleiben neutral (warmes Weiss mit Linie).
 */
export function LoginScreen({ app }: { app: HousekeepingApp }) {
  const { state, t, setLang, doLogin } = app;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (identifier.trim() && password) doLogin(identifier.trim(), password);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page py-10 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center leading-none">
          <p className="brand-wordmark text-[15px] font-semibold tracking-[0.14em] text-ink">UNIQUE PLACES</p>
          <p className="mt-2 text-[11px] font-medium tracking-[0.2em] text-muted">{t('app_name').toUpperCase()}</p>
        </div>

        <div className="rounded-card-lg border border-line bg-warm-white p-8 shadow-card">
          <h1 className="font-heading text-[26px] italic text-ink">{t('login_title')}</h1>
          <p className="mt-1.5 text-[14px] text-muted">{t('login_subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t('username')}</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoCapitalize="off"
                autoComplete="username"
                className="h-[52px] rounded-full border border-line bg-warm-white px-5 text-[15px] text-ink outline-none transition-colors focus:border-sage"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t('password')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-[52px] rounded-full border border-line bg-warm-white px-5 text-[15px] text-ink outline-none transition-colors focus:border-sage"
              />
            </label>

            <Button type="submit" variant="primary" className="mt-2 w-full text-[15px]" disabled={state.loading}>
              {state.loading ? '…' : t('login_btn')}
            </Button>
            {state.loginError ? <p className="text-center text-[13px] text-status-attention">{state.loginError}</p> : null}
          </form>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors',
                state.lang === l ? 'bg-ink text-warm-white' : 'text-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted">v{APP_VERSION}</p>
      </div>
    </div>
  );
}
