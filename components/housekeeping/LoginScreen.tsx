'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import { APP_VERSION } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';
import { AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from '@/components/ui/authFieldStyles';

/**
 * Login-Bildschirm des Housekeeping-Bereichs - Klassen 1:1 aus dem echten Owner-Center-Code
 * uebernommen (src/app/login/page.tsx + LoginForm.tsx dort), nicht nur nach Screenshot
 * angenaehert: Wortmarke + Unterzeile ausserhalb der Karte, freistehende Karte (rounded-3xl,
 * shadow-soft-lg -> hier rounded-card-lg/shadow-card-lg), kursive Fraunces-Ueberschrift,
 * kleine getrackte Feld-Labels, Felder in rounded-xl (hier rounded-control) mit derselben
 * Flaeche wie die Seite, Button voll gerundet mit Opacity-Hover statt Farbwechsel.
 * Der im Referenz-Screenshot sichtbare hellblaue Feld-Hintergrund ist Browser-Autofill, kein
 * Design-Token, und wird bewusst NICHT uebernommen.
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 py-12 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="brand-wordmark font-sans text-sm font-semibold tracking-[0.05em] text-ink">UNIQUE PLACES</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{t('app_name')}</p>
        </div>

        <div className="rounded-card-lg border border-line bg-warm-white p-6 shadow-card-lg sm:p-8">
          <h1 className="italic text-xl text-[#17160f]">{t('login_title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('login_subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={AUTH_LABEL_CLASS}>{t('username')}</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoCapitalize="off"
                autoComplete="username"
                autoFocus
                className={AUTH_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={AUTH_LABEL_CLASS}>{t('password')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={AUTH_INPUT_CLASS}
              />
            </label>

            {state.loginError ? <p className="text-sm text-muted">{state.loginError}</p> : null}

            <button
              type="submit"
              disabled={state.loading}
              className="mt-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-warm-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {state.loading ? '…' : t('login_btn')}
            </button>
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
    </main>
  );
}
