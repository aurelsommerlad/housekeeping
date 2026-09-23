'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LANGUAGES, translate, type Lang } from '@/lib/housekeeping/i18n';
import { APP_VERSION, acceptInvitation, fetchInvitationInfo, type InvitationInfo } from '@/lib/housekeeping/api';
import { AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from '@/components/ui/authFieldStyles';
import { cn } from '@/lib/cn';

type ViewState =
  | { status: 'loading' }
  | { status: 'invalid'; reason: InvitationInfo['status'] }
  | { status: 'form'; email: string };

/**
 * Briefing "Team-/Benutzerverwaltung ueberarbeiten" - Einladungsseite: der einzige Ort, an dem
 * eine per Einladung erstellte Person ihr eigenes Passwort setzt (der einladende Admin/
 * Standortverantwortliche/Teamleader vergibt NIE selbst ein Passwort, siehe InviteUserSheet.tsx).
 *
 * Bewusst OHNE useHousekeepingApp()/App-Shell (anders als app/nfc/[token]/page.tsx): wer hier
 * landet, hat per Definition noch KEINE Session - die Seite ist eine eigenstaendige, vom Rest der
 * App unabhaengige Fluechtigkeits-Route (nur diese Datei + api/auth.js#invitation-info/
 * accept-invite). Die E-Mail-Adresse ist ABSICHTLICH nicht editierbar (Briefing: "E-Mail bleibt
 * unveraenderlich") - sie kommt ausschliesslich aus der bereits serverseitig gepruesten
 * Einladung, nie aus einem Formularfeld.
 *
 * Nach erfolgreicher Annahme setzt api/auth.js#accept-invite bereits das Session-Cookie (Auto-
 * Login) - diese Seite muss dafuer nichts weiter tun als zur Startseite weiterzuleiten, die dort
 * bereits laufende fetchMe()-Pruefung (siehe useHousekeepingApp.ts) erkennt die neue Session von
 * selbst.
 */
export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';

  const [lang, setLang] = useState<Lang>('de');
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars);

  const [view, setView] = useState<ViewState>(() => (token ? { status: 'loading' } : { status: 'invalid', reason: 'not_found' }));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchInvitationInfo(token)
      .then((info) => {
        if (cancelled) return;
        if (info.lang) setLang(info.lang);
        if (info.status === 'pending' && info.email) setView({ status: 'form', email: info.email });
        else setView({ status: 'invalid', reason: info.status });
      })
      .catch(() => {
        if (!cancelled) setView({ status: 'invalid', reason: 'not_found' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!firstName.trim() || !lastName.trim() || !password) {
      setError(t('invite_accept_fill_all'));
      return;
    }
    if (password.length < 8) {
      setError(t('invite_accept_password_length'));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t('invite_accept_password_mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvitation({ token, firstName: firstName.trim(), lastName: lastName.trim(), password, passwordConfirm });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const invalidMessage = (reason: InvitationInfo['status'] | undefined) => {
    if (reason === 'expired') return t('invite_expired');
    if (reason === 'accepted') return t('invite_already_used');
    if (reason === 'revoked') return t('invite_revoked');
    return t('invite_not_found');
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 py-12 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="brand-wordmark font-sans text-sm font-semibold tracking-[0.05em] text-ink">UNIQUE PLACES</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{t('app_name')}</p>
        </div>

        <div className="rounded-card-lg border border-line bg-warm-white p-6 shadow-card-lg sm:p-8">
          {view.status === 'loading' ? (
            <p className="text-sm text-muted">{t('loading')}</p>
          ) : view.status === 'invalid' ? (
            <>
              <h1 className="italic text-xl text-[#17160f]">{t('invite_accept_title')}</h1>
              <p className="mt-3 text-sm text-muted">{invalidMessage(view.reason)}</p>
              <Link href="/" className="mt-5 inline-block text-[13px] font-medium text-ink hover:text-sage">
                {t('invite_back_to_login')}
              </Link>
            </>
          ) : (
            <>
              <h1 className="italic text-xl text-[#17160f]">{t('invite_accept_title')}</h1>
              <p className="mt-1 text-sm text-muted">{t('invite_accept_subtitle')}</p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className={AUTH_LABEL_CLASS}>{t('email')}</span>
                  <input value={view.email} disabled className={cn(AUTH_INPUT_CLASS, 'bg-surface text-muted')} />
                </label>
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className={AUTH_LABEL_CLASS}>{t('first_name')}</span>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      autoFocus
                      className={AUTH_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className={AUTH_LABEL_CLASS}>{t('last_name')}</span>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      className={AUTH_INPUT_CLASS}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className={AUTH_LABEL_CLASS}>{t('invite_accept_password_label')}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={AUTH_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={AUTH_LABEL_CLASS}>{t('invite_accept_password_confirm_label')}</span>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    className={AUTH_INPUT_CLASS}
                  />
                </label>

                {error ? <p className="text-sm text-muted">{error}</p> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-warm-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? '…' : t('invite_accept_submit')}
                </button>
              </form>
            </>
          )}
        </div>

        {view.status === 'form' ? (
          <div className="mt-6 flex justify-center gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors',
                  lang === l ? 'bg-ink text-warm-white' : 'text-muted hover:text-ink',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-center text-[11px] text-muted">v{APP_VERSION}</p>
      </div>
    </main>
  );
}
