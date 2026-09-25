'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { getTeamMemberships, isAdmin, isLocationManager, isTeamLead } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { todayISO } from '@/lib/housekeeping/rooms';
import { Button } from '@/components/ui/Button';
import { ADMIN_INPUT_CLASS, AdminBadge, AdminSection } from './admin';
import { cn } from '@/lib/cn';

export interface HousekeepingTeamsScreenProps {
  app: HousekeepingApp;
  /** Einstellungen > Standorte & Apartments > <Property> - zeigt fuer einen Admin nur das
   * aktuell fuer dieses Property zustaendige Team und die Standardzuordnung ausschliesslich
   * fuer dieses eine Property (statt der Liste aller Properties). Fuer einen Team Lead aendert
   * sich nichts (er sieht ohnehin nur sein eigenes Team). */
  propertyFilter?: string;
}

/**
 * Reinigungsfirmen & Teams - reine EINSTELLUNGEN-Unterseite bzw. TeamScreen-Tab, KEIN zweites
 * Admin-Backend und KEINE zweite Mitarbeiterverwaltung: Mitgliedschaft/Rolle eines Users wird
 * ausschliesslich ueber das bestehende Formular gepflegt (UserFormSheet.tsx, ueber "Mitarbeiter"
 * erreichbar) - hier nur gelesen/gruppiert dargestellt, plus die Konzepte, die ausschliesslich
 * hier leben: Team-Stammdaten (inkl. zugeordneter Standorte, Briefing "Team-/Benutzerverwaltung
 * ueberarbeiten") anlegen/deaktivieren und das Standard-Team je Property (wird NIE nach Apaleo
 * geschrieben). Admin sieht/verwaltet alles teamuebergreifend; ein Standortverantwortlicher sieht
 * nur Teams, die (auch) an einem seiner eigenen Standorte taetig sind, rein lesend; ein Team-Lead
 * sieht ausschliesslich die eigene(n) Reinigungsfirma(en), ebenfalls rein lesend (Teams selbst
 * verwalten bleibt admin-only, siehe canManageTeam in lib/housekeeping/permissions.ts).
 *
 * Liest/schreibt Mitgliedschaft ausschliesslich ueber `teamMemberships[]`
 * (getTeamMemberships/sanitizeTeamMemberships) - NICHT mehr ueber die fruehere
 * `housekeepingTeamId`/`teamRole`-Skalarform, die `upsertUser` seit der Mehrfach-Team-
 * Unterstuetzung bei jedem Schreibvorgang entfernt (siehe api/_users.js).
 */
export function HousekeepingTeamsScreen({ app, propertyFilter }: HousekeepingTeamsScreenProps) {
  const { state, t, saveTeam, setTeamPropertyDefault, saveUser, teamCapacityFor } = app;
  const [newTeamName, setNewTeamName] = useState('');
  const admin = isAdmin(state.user);
  const locationManager = isLocationManager(state.user);
  const lead = isTeamLead(state.user);
  const today = state.planningDays[0] || todayISO();
  const workload = teamCapacityFor(today);

  const managedProperties = state.user?.managedProperties || [];
  const visibleTeams = admin
    ? (propertyFilter ? state.teams.filter((tm) => state.teamPropertyDefaults[propertyFilter] === tm.id) : state.teams)
    : locationManager
      ? state.teams.filter((tm) => (tm.propertyIds || []).some((p) => managedProperties.includes(p)))
      : state.teams.filter((tm) => getTeamMemberships(state.user).some((m) => m.teamId === tm.id));
  const visibleProperties = propertyFilter ? state.properties.filter((p) => p.code === propertyFilter) : state.properties;

  function membersOf(teamId: string): StaffUser[] {
    return state.users.filter((u) => getTeamMemberships(u).some((m) => m.teamId === teamId));
  }

  function isLeaderOf(member: StaffUser, teamId: string): boolean {
    return getTeamMemberships(member).some((m) => m.teamId === teamId && m.isLeader);
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    await saveTeam({ name: newTeamName.trim(), active: true, propertyIds: [] });
    setNewTeamName('');
  }

  async function toggleTeamActive(teamId: string, name: string, active: boolean, propertyIds: string[]) {
    if (typeof window !== 'undefined' && active && !window.confirm(t('team_deactivate_confirm'))) return;
    await saveTeam({ id: teamId, name, active: !active, propertyIds });
  }

  async function toggleTeamProperty(teamId: string, name: string, active: boolean, propertyIds: string[], code: string) {
    const next = propertyIds.includes(code) ? propertyIds.filter((p) => p !== code) : [...propertyIds, code];
    await saveTeam({ id: teamId, name, active, propertyIds: next });
  }

  async function toggleMemberRole(member: StaffUser, teamId: string) {
    // Server sanitisiert/dedupliziert teamMemberships ohnehin bei jedem Schreibvorgang
    // (siehe api/_users.js#upsertUser) - hier reicht die reine Umformung.
    const memberships = getTeamMemberships(member).map((m) => (m.teamId === teamId ? { ...m, isLeader: !m.isLeader } : m));
    await saveUser({ id: member.id, username: member.username, teamMemberships: memberships });
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleTeams.map((team) => {
        const members = membersOf(team.id);
        const leads = members.filter((m) => isLeaderOf(m, team.id));
        const teamWorkload = workload.find((w) => w.teamId === team.id);
        const propertyIds = team.propertyIds || [];
        return (
          <AdminSection
            key={team.id}
            title={team.name}
            description={`${t('team_member_count', { n: members.length })} · ${t('team_lead_count', { n: leads.length })}`}
            actions={
              <div className="flex items-center gap-2">
                {!team.active ? <AdminBadge label={t('team_inactive_label')} tone="muted" /> : null}
                {admin ? (
                  <Button variant="ghost" size="sm" onClick={() => toggleTeamActive(team.id, team.name, team.active, propertyIds)}>
                    {team.active ? t('deactivate_user_action') : t('reactivate_user_action')}
                  </Button>
                ) : null}
              </div>
            }
          >
            {propertyIds.length > 0 || admin ? (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{t('team_locations_label')}</p>
                {admin ? (
                  <>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {state.properties.map((p) => (
                        <button
                          key={p.code}
                          type="button"
                          onClick={() => toggleTeamProperty(team.id, team.name, team.active, propertyIds, p.code)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                            propertyIds.includes(p.code) ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                          )}
                        >
                          {getPropertyDisplayName(p)}
                        </button>
                      ))}
                    </div>
                    {/* Nutzerfeedback: neu angelegte Teams bekamen trotz hier zugeordneter
                     * Standorte keine offenen Reinigungen angezeigt - diese Pillen aendern
                     * ausschliesslich `HousekeepingTeam.propertyIds` (reines Scoping), waehrend die
                     * tatsaechliche automatische Zuweisung ueber das separate "Standard-Team je
                     * Property"-Feld weiter unten laeuft (siehe resolveTasks() in tasks.ts). Reiner
                     * Hinweistext, keine Verhaltensaenderung. */}
                    <p className="mt-1.5 text-xs text-muted">{t('team_locations_hint')}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink">
                    {propertyIds.map((code) => {
                      const prop = state.properties.find((p) => p.code === code);
                      return prop ? getPropertyDisplayName(prop) : code;
                    }).join(', ')}
                  </p>
                )}
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn('truncate', member.active === false ? 'text-muted line-through' : 'text-ink')}>
                    {member.name}
                    {isLeaderOf(member, team.id) ? ` (${t('team_role_lead')})` : ` (${t('team_role_member')})`}
                  </span>
                  {admin ? (
                    <Button variant="ghost" size="sm" onClick={() => toggleMemberRole(member, team.id)}>
                      {isLeaderOf(member, team.id) ? t('team_make_member') : t('team_make_lead')}
                    </Button>
                  ) : null}
                </div>
              ))}
              {members.length === 0 ? <p className="text-xs text-muted">{t('team_no_members')}</p> : null}
            </div>

            {teamWorkload ? (
              <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
                <p className="font-medium text-ink">{t('team_workload_today', { n: teamWorkload.total })}</p>
                {teamWorkload.perPerson.map((p) => (
                  <p key={p.housekeeperId || 'unassigned'}>
                    {p.housekeeperId ? p.housekeeperName : t('team_task_unclaimed')} · {p.count}
                  </p>
                ))}
              </div>
            ) : null}
          </AdminSection>
        );
      })}

      {!admin && !locationManager && !lead ? <p className="text-sm text-muted">{t('team_no_access')}</p> : null}

      {admin ? (
        <>
          <AdminSection eyebrow={t('team_new_title')}>
            <div className="flex gap-2">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder={t('team_name_placeholder')}
                className={ADMIN_INPUT_CLASS}
              />
              <Button variant="primary" onClick={handleCreateTeam}>{t('team_create')}</Button>
            </div>
          </AdminSection>

          <AdminSection eyebrow={t('team_property_defaults_title')} description={t('team_property_defaults_hint')}>
            <div className="flex flex-col divide-y divide-line">
              {visibleProperties.map((p) => {
                const currentTeamId = state.teamPropertyDefaults[p.code] || '';
                return (
                  <div key={p.code} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                    <span className="truncate text-sm text-ink">{getPropertyDisplayName(p)}</span>
                    <select
                      value={currentTeamId}
                      onChange={(e) => setTeamPropertyDefault(p.code, e.target.value || null)}
                      className={cn(ADMIN_INPUT_CLASS, 'w-auto')}
                    >
                      <option value="">{t('no_team_label')}</option>
                      {state.teams.filter((tm) => tm.active).map((tm) => (
                        <option key={tm.id} value={tm.id}>{tm.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </AdminSection>
        </>
      ) : null}
    </div>
  );
}
