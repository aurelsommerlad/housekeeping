'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { Lang } from '@/lib/housekeeping/i18n';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { getTeamMemberships, sanitizeManagedProperties } from '@/lib/housekeeping/permissions';
import { todayISO } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { Role, StaffUser, TeamMembership } from '@/lib/housekeeping/types';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface UserFormSheetProps {
  app: HousekeepingApp;
  user: StaffUser;
  onClose: () => void;
}

const ROLES: Role[] = ['admin', 'location_manager', 'housekeeper'];

/**
 * Briefing "Team-/Benutzerverwaltung ueberarbeiten": Bearbeitungsformular fuer einen BESTEHENDEN
 * Mitarbeiter - Neuanlage laeuft seit der Einfuehrung des Einladungssystems ausschliesslich ueber
 * InviteUserSheet.tsx (Punkt "sicheres Einladungssystem" ersetzt die fruehere direkte
 * Admin-Passwortvergabe fuer neue Konten). Ausschliesslich ueber TeamScreen.tsx erreichbar, das
 * bereits serverseitig/clientseitig sicherstellt, dass nur ein Admin hierher gelangt
 * (canManageUser ist bewusst admin-only, siehe lib/housekeeping/permissions.ts).
 *
 * Rolle ist jetzt ein 3-Werte-Dropdown statt zweier Buttons (admin/location_manager/housekeeper,
 * siehe types.ts#Role) - `managedProperties` (Standortverantwortung) ist nur bei
 * role==='location_manager' sichtbar/setzbar, sonst wird sie beim Speichern geleert (sonst wuerde
 * api/_users.js#migrateUserRecord die Rolle beim naechsten Laden automatisch wieder auf
 * location_manager zurueckstufen). Teammitgliedschaft ist jetzt ein Mehrfachauswahl-Set
 * (teamMemberships[]) statt einer einzelnen housekeepingTeamId/teamRole-Kombination - ein User
 * kann Mitglied mehrerer Teams gleichzeitig sein, in jedem davon unabhaengig Teamleader.
 */
export function UserFormSheet({ app, user, onClose }: UserFormSheetProps) {
  const { state, t, saveUser } = app;
  const [firstName, setFirstName] = useState(user.firstName || user.name?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user.lastName || user.name?.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<Role>(user.role);
  const [lang, setLang] = useState<Lang>(user.lang || 'de');
  const [active, setActive] = useState(user.active !== false);
  const isAllInitially = user.properties === 'alle' || user.properties === 'all';
  const [allProperties, setAllProperties] = useState(isAllInitially);
  const [properties, setProperties] = useState<string[]>(isAllInitially ? [] : (user.properties as string[]));
  const [managedProperties, setManagedProperties] = useState<string[]>(user.managedProperties || []);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>(getTeamMemberships(user));
  const [password, setPassword] = useState('');

  const futureAssignmentCount = countFutureAssignments(user, state.taskAssignments);

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
      if (!next) setManagedProperties((mp) => sanitizeManagedProperties(properties, mp));
      return next;
    });
  }

  function toggleTeam(teamId: string) {
    setTeamMemberships((prev) => (prev.some((m) => m.teamId === teamId)
      ? prev.filter((m) => m.teamId !== teamId)
      : [...prev, { teamId, isLeader: false }]));
  }

  function toggleLeader(teamId: string) {
    setTeamMemberships((prev) => prev.map((m) => (m.teamId === teamId ? { ...m, isLeader: !m.isLeader } : m)));
  }

  async function handleDeactivate() {
    if (typeof window === 'undefined') return;
    const message = futureAssignmentCount > 0
      ? `${t('deactivate_user_confirm')}\n\n${t('deactivate_future_assignments_warning', { n: futureAssignmentCount })}`
      : t('deactivate_user_confirm');
    if (!window.confirm(message)) return;
    setActive(false);
  }

  async function handleSubmit() {
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || user.name;
    await saveUser({
      id: user.id,
      username: user.username,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name,
      email: email.trim(),
      role,
      lang,
      active,
      properties: allProperties ? 'alle' : properties,
      // role !== 'location_manager': serverseitig wuerde api/_users.js#upsertUser managedProperties
      // ohnehin wieder gegen `properties` schneiden, aber ein leeres Array hier verhindert
      // zusaetzlich die migrateUserRecord-Selbstheilung (Rolle wieder auf location_manager
      // hochstufen, sobald managedProperties nicht leer ist).
      managedProperties: role === 'location_manager' ? sanitizeManagedProperties(allProperties ? 'alle' : properties, managedProperties) : [],
      teamMemberships,
      ...(password ? { password } : {}),
    });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{[firstName, lastName].filter(Boolean).join(' ') || user.username}</h3>

      <div className="mt-4 flex flex-col gap-3">
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

        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('role')}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'admin' ? t('role_admin') : r === 'location_manager' ? t('role_location_manager') : t('role_housekeeper')}
              </option>
            ))}
          </select>
        </label>

        {state.teams.filter((tm) => tm.active).length > 0 ? (
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            {t('team_memberships_label')}
            <div className="flex flex-col gap-1 rounded-control border border-line">
              {state.teams.filter((tm) => tm.active).map((tm) => {
                const membership = teamMemberships.find((m) => m.teamId === tm.id);
                return (
                  <div key={tm.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                    <button type="button" onClick={() => toggleTeam(tm.id)} className="flex flex-1 items-center gap-2 text-left">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px]',
                          membership ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-transparent',
                        )}
                      >
                        ✓
                      </span>
                      <span className="text-ink">{tm.name}</span>
                    </button>
                    {membership ? (
                      <button
                        type="button"
                        onClick={() => toggleLeader(tm.id)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          membership.isLeader ? 'border-status-attention bg-status-attention-bg text-status-attention' : 'border-line bg-warm-white text-muted',
                        )}
                      >
                        {t('team_membership_leader_label')}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
            onClick={() => (active ? handleDeactivate() : setActive(true))}
            className={cn(
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
              active ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
            )}
          >
            {active ? t('active_label') : t('inactive_label')}
          </button>
          {active && futureAssignmentCount > 0 ? (
            <p className="text-xs text-status-attention">{t('deactivate_future_assignments_warning', { n: futureAssignmentCount })}</p>
          ) : null}
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

          <div className="mt-1 flex flex-col gap-1 rounded-control border border-line">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              <span className="flex-1">{t('properties')}</span>
              <span className="w-16 text-right">{t('access_label')}</span>
              {role === 'location_manager' ? <span className="w-20 text-right">{t('managed_properties')}</span> : null}
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
                  {role === 'location_manager' ? (
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
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('password')} (leer lassen = unveraendert)
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

/** Briefing "Team-/Benutzerverwaltung ueberarbeiten" Punkt 26 ("Admin vor Deaktivierung warnen,
 * wenn zukuenftige Zuweisungen bestehen") - Task-IDs sind deterministisch aufgebaut
 * ("<propertyCode>|<unitId>|<date>|<type>|<sourceReservationId>", siehe
 * lib/housekeeping/tasks.ts#taskId), das Datum laesst sich also direkt daraus lesen, ohne die
 * komplette Task-Ableitung erneut aufzurufen. */
function countFutureAssignments(user: StaffUser, taskAssignments: Record<string, { housekeeperId: string } | null>): number {
  const today = todayISO();
  let count = 0;
  for (const [taskId, assignment] of Object.entries(taskAssignments)) {
    if (!assignment || assignment.housekeeperId !== user.id) continue;
    const date = taskId.split('|')[2];
    if (date && date >= today) count += 1;
  }
  return count;
}
