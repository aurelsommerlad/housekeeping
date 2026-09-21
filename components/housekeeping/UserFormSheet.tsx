'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { Lang } from '@/lib/housekeeping/i18n';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { sanitizeManagedProperties } from '@/lib/housekeeping/permissions';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface UserFormSheetProps {
  app: HousekeepingApp;
  user: StaffUser | null;
  onClose: () => void;
}

/**
 * Ersetzt die frueheren `prompt()`-Dialoge des Team-Screens durch ein hochwertiges Formular im
 * Bottom Sheet - ruft dieselbe `saveUser`-Aktion (api/users.js#set) mit denselben Feldern auf,
 * jetzt erweitert um Punkt 17 (Vorname/Nachname/Sprache/aktiv + Property-Zugriff UND
 * Standortverantwortlich in einer gemeinsamen Tabelle statt zweier getrennter Formulare).
 *
 * Wird vom Team-Screen nur bei geoeffnetem Formular ueberhaupt gemountet (statt dauerhaft mit
 * einem `open`-Flag) - so liest jeder Feld-State per Lazy-Initializer direkt aus `user`, ohne
 * einen synchronisierenden Effekt zu brauchen.
 */
export function UserFormSheet({ app, user, onClose }: UserFormSheetProps) {
  const { state, t, saveUser } = app;
  const [username, setUsername] = useState(user?.username || '');
  const [firstName, setFirstName] = useState(user?.name?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user?.name?.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<'admin' | 'housekeeping'>(user?.role === 'admin' ? 'admin' : 'housekeeping');
  const [lang, setLang] = useState<Lang>(user?.lang || 'de');
  const [active, setActive] = useState(user?.active !== false);
  const isAllInitially = !user || user.properties === 'alle' || user.properties === 'all';
  const [allProperties, setAllProperties] = useState(isAllInitially);
  const [properties, setProperties] = useState<string[]>(isAllInitially ? [] : (user!.properties as string[]));
  const [managedProperties, setManagedProperties] = useState<string[]>(user?.managedProperties || []);
  const [housekeepingTeamId, setHousekeepingTeamId] = useState<string>(user?.housekeepingTeamId || '');
  const [teamRole, setTeamRole] = useState<'member' | 'lead'>(user?.teamRole === 'lead' ? 'lead' : 'member');
  const [password, setPassword] = useState('');

  // Punkt 17: Standortverantwortlich nur moeglich, wenn Zugriff aktiv ist; wird Zugriff
  // entfernt, faellt Standortverantwortlich fuer dieses Property automatisch mit weg -
  // clientseitig sofort beim Toggle durchgesetzt, serverseitig zusaetzlich in api/_users.js.
  function toggleProperty(code: string) {
    setProperties((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      setManagedProperties((mp) => sanitizeManagedProperties(next, mp));
      return next;
    });
  }

  function toggleManaged(code: string) {
    const hasAccess = allProperties || properties.includes(code);
    if (!hasAccess) return;
    setManagedProperties((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function toggleAllProperties() {
    setAllProperties((v) => {
      const next = !v;
      // "Alle Haeuser" deaktiviert -> vorher moeglicherweise ueberall gesetzte
      // Standortverantwortung wird sofort gegen die (dann leere) Property-Liste geprueft.
      if (!next) setManagedProperties((mp) => sanitizeManagedProperties(properties, mp));
      return next;
    });
  }

  async function handleSubmit() {
    if (!username.trim()) return;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || username.trim();
    await saveUser({
      username: username.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name,
      email: email.trim(),
      role,
      lang,
      active,
      properties: allProperties ? 'alle' : properties,
      managedProperties: sanitizeManagedProperties(allProperties ? 'alle' : properties, managedProperties),
      housekeepingTeamId: housekeepingTeamId || undefined,
      teamRole: housekeepingTeamId ? teamRole : undefined,
      ...(password ? { password } : {}),
    });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{user ? [firstName, lastName].filter(Boolean).join(' ') || username : t('new_user')}</h3>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('username')}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!user}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink disabled:bg-surface disabled:text-muted"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[13px] font-medium text-muted">
            {t('first_name')}
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[13px] font-medium text-muted">
            {t('last_name')}
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('role')}
          <div className="flex gap-2">
            {(['housekeeping', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={
                  'flex-1 rounded-control border px-3 py-2.5 text-[13px] font-medium transition-colors ' +
                  (role === r ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted')
                }
              >
                {r === 'admin' ? t('role_admin') : t('role_housekeeper')}
              </button>
            ))}
          </div>
        </div>

        {state.teams.length > 0 ? (
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            {t('housekeeping_team_label')}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHousekeepingTeamId('')}
                className={cn(
                  'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                  !housekeepingTeamId ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                )}
              >
                {t('no_team_label')}
              </button>
              {state.teams.filter((tm) => tm.active).map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  onClick={() => setHousekeepingTeamId(tm.id)}
                  className={cn(
                    'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                    housekeepingTeamId === tm.id ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                  )}
                >
                  {tm.name}
                </button>
              ))}
            </div>
            {housekeepingTeamId ? (
              <div className="mt-1 flex gap-2">
                {(['member', 'lead'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTeamRole(r)}
                    className={cn(
                      'flex-1 rounded-control border px-3 py-2.5 text-[13px] font-medium transition-colors',
                      teamRole === r ? 'border-status-attention bg-status-attention-bg text-status-attention' : 'border-line bg-warm-white text-muted',
                    )}
                  >
                    {r === 'lead' ? t('team_role_lead') : t('team_role_member')}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('language_label')}
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'flex-1 rounded-control border px-3 py-2 text-[13px] font-semibold uppercase transition-colors',
                  lang === l ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('active_label')}
          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className={cn(
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
              active ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
            )}
          >
            {active ? t('active_label') : t('inactive_label')}
          </button>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('properties')}
          <button
            type="button"
            onClick={toggleAllProperties}
            className={
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ' +
              (allProperties ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink')
            }
          >
            {t('all_properties')}
          </button>

          {/* Punkt 17: Zugriff UND Standortverantwortlich in einer gemeinsamen Tabelle je
           * Property statt zweier getrennter Listen. */}
          <div className="mt-1 flex flex-col gap-1 rounded-control border border-line">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              <span className="flex-1">{t('properties')}</span>
              <span className="w-16 text-right">{t('access_label')}</span>
              <span className="w-20 text-right">{t('managed_properties')}</span>
            </div>
            {state.properties.map((p) => {
              const hasAccess = allProperties || properties.includes(p.code);
              const isManaged = managedProperties.includes(p.code);
              return (
                <div key={p.code} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="flex-1 truncate text-ink">{getPropertyDisplayName(p)}</span>
                  <span className="flex w-16 justify-end">
                    <button
                      type="button"
                      disabled={allProperties}
                      onClick={() => toggleProperty(p.code)}
                      aria-pressed={hasAccess}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors',
                        hasAccess ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-transparent',
                        allProperties && 'opacity-50',
                      )}
                    >
                      ✓
                    </button>
                  </span>
                  <span className="flex w-20 justify-end">
                    <button
                      type="button"
                      disabled={!hasAccess}
                      onClick={() => toggleManaged(p.code)}
                      aria-pressed={isManaged}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors',
                        isManaged ? 'border-status-attention bg-status-attention text-warm-white' : 'border-line bg-warm-white text-transparent',
                        !hasAccess && 'opacity-40',
                      )}
                    >
                      ✓
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('password')} {user ? '(leer lassen = unveraendert)' : ''}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>
      </div>

      <Button variant="primary" className="mt-5 w-full" onClick={handleSubmit}>
        {t('save')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
