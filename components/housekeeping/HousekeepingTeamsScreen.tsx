'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { todayISO } from '@/lib/housekeeping/rooms';
import { Button } from '@/components/ui/Button';
import { ADMIN_INPUT_CLASS, ADMIN_SELECT_CLASS, AdminBadge, AdminSection } from './admin';
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
 * Reinigungsfirmen & Teams - reine EINSTELLUNGEN-Unterseite, KEIN zweites Admin-Backend und
 * KEINE zweite Mitarbeiterverwaltung: Mitgliedschaft/Rolle eines Users wird ausschliesslich
 * ueber das bestehende Formular gepflegt (UserFormSheet.tsx, ueber "Mitarbeiter" erreichbar) -
 * hier nur gelesen/gruppiert dargestellt, plus die neuen, ausschliesslich hier lebenden
 * Konzepte: Team-Stammdaten anlegen und Standard-Team je Property (wird NIE nach Apaleo
 * geschrieben). Admin sieht/verwaltet alles teamuebergreifend; ein Team-Lead sieht
 * ausschliesslich die eigene Reinigungsfirma, rein lesend.
 */
export function HousekeepingTeamsScreen({ app, propertyFilter }: HousekeepingTeamsScreenProps) {
  const { state, t, saveTeam, setTeamPropertyDefault, saveUser, teamCapacityFor } = app;
  const [newTeamName, setNewTeamName] = useState('');
  const admin = isAdmin(state.user);
  const lead = isTeamLead(state.user);
  const today = state.planningDays[0] || todayISO();
  const workload = teamCapacityFor(today);

  const visibleTeams = admin
    ? (propertyFilter ? state.teams.filter((tm) => state.teamPropertyDefaults[propertyFilter] === tm.id) : state.teams)
    : state.teams.filter((tm) => tm.id === state.user?.housekeepingTeamId);
  const visibleProperties = propertyFilter ? state.properties.filter((p) => p.code === propertyFilter) : state.properties;

  function membersOf(teamId: string): StaffUser[] {
    return state.users.filter((u) => u.housekeepingTeamId === teamId);
  }

  function propertiesOf(teamId: string): string[] {
    return Object.entries(state.teamPropertyDefaults)
      .filter(([, tId]) => tId === teamId)
      .map(([propertyCode]) => propertyCode);
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    await saveTeam({ name: newTeamName.trim(), active: true });
    setNewTeamName('');
  }

  async function toggleMemberRole(member: StaffUser) {
    await saveUser({ ...member, teamRole: member.teamRole === 'lead' ? 'member' : 'lead' });
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleTeams.map((team) => {
        const members = membersOf(team.id);
        const leads = members.filter((m) => m.teamRole === 'lead');
        const teamWorkload = workload.find((w) => w.teamId === team.id);
        return (
          <AdminSection
            key={team.id}
            title={team.name}
            description={`${t('team_member_count', { n: members.length })} · ${t('team_lead_count', { n: leads.length })}`}
            actions={!team.active ? <AdminBadge label={t('team_inactive_label')} tone="muted" /> : undefined}
          >
            {propertiesOf(team.id).length > 0 ? (
              <p className="text-xs text-muted">
                {t('team_responsible_for')}: {propertiesOf(team.id).map((code) => {
                  const prop = state.properties.find((p) => p.code === code);
                  return prop ? getPropertyDisplayName(prop) : code;
                }).join(', ')}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn('truncate', member.active === false ? 'text-muted line-through' : 'text-ink')}>
                    {member.name}
                    {member.teamRole === 'lead' ? ` (${t('team_role_lead')})` : ` (${t('team_role_member')})`}
                  </span>
                  {admin ? (
                    <Button variant="ghost" size="sm" onClick={() => toggleMemberRole(member)}>
                      {member.teamRole === 'lead' ? t('team_make_member') : t('team_make_lead')}
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

      {!admin && !lead ? <p className="text-sm text-muted">{t('team_no_access')}</p> : null}

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

          <AdminSection eyebrow={t('team_property_defaults_title')}>
            <div className="flex flex-col divide-y divide-line">
              {visibleProperties.map((p) => {
                const currentTeamId = state.teamPropertyDefaults[p.code] || '';
                return (
                  <div key={p.code} className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                    <span className="truncate text-sm text-ink">{getPropertyDisplayName(p)}</span>
                    <select
                      value={currentTeamId}
                      onChange={(e) => setTeamPropertyDefault(p.code, e.target.value || null)}
                      className={cn(ADMIN_SELECT_CLASS, 'w-auto')}
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
