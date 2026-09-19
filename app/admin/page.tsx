'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';

type Screen = 'loading' | 'error' | 'setup' | 'login' | 'authenticated';

interface SessionUser {
  id: string;
  name?: string;
  email?: string;
  role: string;
}

/**
 * Adminbereich-Einstieg. Zustandsmaschine mit klar getrennten Faellen (siehe Bugreport):
 *  - 'loading'       waehrend der Setup-Status/Session serverseitig geprueft wird
 *  - 'error'         GET /api/auth/setup-status ist fehlgeschlagen (Netzwerk/Server) - wird
 *                     NIEMALS stillschweigend als "Login zeigen" behandelt
 *  - 'setup'         kein Admin vorhanden (needsSetup === true) -> Registrierungsformular
 *  - 'login'         Admin vorhanden, keine gueltige Admin-Session -> Login
 *  - 'authenticated' gueltige Admin-Session vorhanden
 *
 * Die eigentliche Wahrheit ("existiert ein User mit role === 'admin'?") kommt ausschliesslich
 * von GET /api/auth/setup-status (serverseitig, siehe lib/server/auth.ts). Es gibt keinen
 * Client-Fallback, der bei einem Fehler dieser Abfrage einfach den Login anzeigt.
 */
export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let statusRes: Response;
      try {
        statusRes = await fetch('/api/auth/setup-status', { cache: 'no-store' });
      } catch {
        if (!cancelled) {
          setErrorMessage('Der Setup-Status konnte nicht abgerufen werden (Netzwerkfehler). Bitte Seite neu laden.');
          setScreen('error');
        }
        return;
      }

      if (!statusRes.ok) {
        if (!cancelled) {
          setErrorMessage(`Der Setup-Status konnte nicht abgerufen werden (Serverfehler ${statusRes.status}). Bitte spaeter erneut versuchen.`);
          setScreen('error');
        }
        return;
      }

      const statusData = await statusRes.json().catch(() => null);
      if (!statusData || typeof statusData.needsSetup !== 'boolean') {
        if (!cancelled) {
          setErrorMessage('Unerwartete Antwort vom Server beim Pruefen des Setup-Status.');
          setScreen('error');
        }
        return;
      }

      if (statusData.needsSetup) {
        if (!cancelled) setScreen('setup');
        return;
      }

      // Ein Admin existiert bereits - pruefen, ob schon eine gueltige Admin-Session besteht.
      // Ein Fehler hier faellt bewusst auf 'login' zurueck (nicht auf 'setup'!), denn die
      // Existenz eines Admins wurde oben bereits serverseitig zweifelsfrei bestaetigt.
      try {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
        const meData = meRes.ok ? await meRes.json().catch(() => null) : null;
        if (!cancelled) {
          if (meData?.authenticated && meData.user?.role === 'admin') {
            setUser(meData.user);
            setScreen('authenticated');
          } else {
            setScreen('login');
          }
        }
      } catch {
        if (!cancelled) setScreen('login');
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: String(form.get('firstName') || '').trim(),
      lastName: String(form.get('lastName') || '').trim(),
      email: String(form.get('email') || '').trim(),
      password: String(form.get('password') || ''),
      passwordConfirm: String(form.get('passwordConfirm') || ''),
    };

    if (payload.password !== payload.passwordConfirm) {
      setFormError('Die Passwoerter stimmen nicht ueberein.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Registrierung fehlgeschlagen.');
        // Falls in der Zwischenzeit doch schon ein Admin angelegt wurde (Race mit einem
        // zweiten Tab/Geraet), zeige jetzt konsequent den Login statt das Formular offen zu
        // lassen.
        if (res.status === 409) setScreen('login');
        return;
      }
      setUser(data.user);
      setScreen('authenticated');
    } catch {
      setFormError('Netzwerkfehler - bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get('identifier') || '').trim();
    const password = String(form.get('password') || '');

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, scope: 'admin' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Anmeldung fehlgeschlagen.');
        return;
      }
      setUser(data.user);
      setScreen('authenticated');
    } catch {
      setFormError('Netzwerkfehler - bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignorieren - im Zweifel einfach den Login-Screen zeigen.
    }
    setUser(null);
    setScreen('login');
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center leading-none">
          <p className="brand-wordmark text-[11px] font-semibold tracking-[0.18em] text-ink">
            UNIQUE PLACES
          </p>
          <p className="mt-1 text-[15px] font-medium tracking-[0.04em] text-muted">Housekeeping</p>
        </div>

        {screen === 'loading' && (
          <p className="text-center text-sm text-muted">Wird geladen...</p>
        )}

        {screen === 'error' && (
          <div className="rounded-card border border-status-attention/30 bg-status-attention-bg p-5 text-center">
            <p className="text-sm font-medium text-status-attention">Status konnte nicht geladen werden</p>
            <p className="mt-2 text-[13px] text-ink/80">{errorMessage}</p>
            <Button className="mt-4" size="sm" onClick={() => window.location.reload()}>
              Erneut versuchen
            </Button>
          </div>
        )}

        {screen === 'setup' && (
          <form onSubmit={handleSetupSubmit} className="flex flex-col gap-3">
            <h1 className="mb-1 text-center text-[15px] font-medium text-ink">Admin-Konto einrichten</h1>
            <Field label="Vorname" name="firstName" autoComplete="given-name" required />
            <Field label="Nachname" name="lastName" autoComplete="family-name" required />
            <Field label="E-Mail" name="email" type="email" autoComplete="email" required />
            <Field label="Passwort" name="password" type="password" autoComplete="new-password" required />
            <Field label="Passwort wiederholen" name="passwordConfirm" type="password" autoComplete="new-password" required />
            {formError && <p className="text-[13px] text-status-attention">{formError}</p>}
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? 'Wird erstellt...' : 'Admin-Konto erstellen'}
            </Button>
          </form>
        )}

        {screen === 'login' && (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
            <Field label="E-Mail" name="identifier" type="email" autoComplete="username" required />
            <Field label="Passwort" name="password" type="password" autoComplete="current-password" required />
            {formError && <p className="text-[13px] text-status-attention">{formError}</p>}
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? 'Wird angemeldet...' : 'Anmelden'}
            </Button>
          </form>
        )}

        {screen === 'authenticated' && (
          <div className="text-center">
            <p className="text-sm text-ink">
              Angemeldet als <span className="font-medium">{user?.name || user?.email}</span>
            </p>
            <p className="mt-2 text-[13px] text-muted">
              Das Admin-Dashboard (Team, Statistik, Regeln, Zuweisungen) folgt in einem naechsten Schritt.
            </p>
            <Button variant="secondary" size="sm" className="mt-5" onClick={handleLogout}>
              Abmelden
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-left">
      <span className="text-[12px] text-muted">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="h-11 rounded-control border border-line bg-warm-white px-3.5 text-sm text-ink outline-none transition-colors focus:border-sage"
      />
    </label>
  );
}
