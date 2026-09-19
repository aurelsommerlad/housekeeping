'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/** Login-Bildschirm des Housekeeping-Bereichs, in derselben Designsprache wie /admin. */
export function LoginScreen({ app }: { app: HousekeepingApp }) {
  const { state, t, setLang, doLogin } = app;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (identifier.trim() && password) doLogin(identifier.trim(), password);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 py-10">
      <div className="w-full max-w-xs">
        <p className="brand-wordmark text-center text-[11px] font-semibold tracking-[0.18em] text-ink">UNIQUE PLACES</p>
        <h1 className="mt-1 text-center font-heading text-2xl text-ink">{t('app_name')}</h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            {t('username')}
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoCapitalize="off"
              autoComplete="username"
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            {t('password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            />
          </label>

          <Button type="submit" variant="primary" className="mt-2 w-full" disabled={state.loading}>
            {state.loading ? '…' : t('login_btn')}
          </Button>
          {state.loginError ? <p className="text-center text-[13px] text-status-attention">{state.loginError}</p> : null}
        </form>

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
      </div>
    </div>
  );
}
