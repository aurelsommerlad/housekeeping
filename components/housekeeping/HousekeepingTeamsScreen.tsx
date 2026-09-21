'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { todayISO } from '@/lib/housekeeping/rooms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

export interface HousekeepingTeamsScreenProps {
  app: HousekeepingApp;
}

/**
 * Reinigungsfirmen & Teams (Briefing "Housekeeping Teams") - reine EINSTELLUNGEN-Unterseite,
 * KEIN zweites Admin-Backend und KEINE zweite Mitarbeiterverwaltung: Mitgliedschaft/Rolle eines
 * Users wird ausschliesslich ueber das bestehende Formular gepflegt (UserFormSheet.tsx, ueber den
 * bestehenden Team-Screen erreichbar) - hier nur gelesen/gruppiert dargestellt, plus die neuen,
 * ausschliesslich hier lebenden Konzepte: Team-Stammdaten anlegen und Standard-Team je Property
 * (Punkt "wird NIE nach Apaleo geschrieben"). Admin sieht/verwaltet alles teamuebergreifend; ein
 * Team-Lead sieht ausschliesslich die eigene Reinigungsfirma, rein lesend (Zuweisung einzelner
 * Reinigungen bleibt Sache der Task-Detailansicht, siehe TaskDetailSheet.tsx).
 */
export function HousekeepingTeamsScreen({ app }: HousekeepingTeamsScreenProps) {
  const { state, t, saveTeam, setTeamPropertyDefault, saveUser, teamCapacityFor } = app;
  const [newTeamName, setNewTeamName] = useState('');
  const admin = isAdmin(state.user);
  const lead = isTeamLead(state.user);
  const today = state.planningDays[0] || todayISO();
  const workload = teamCapacityFor(today);

  const visibleTeams = admin
    ? state.teams
    : state.teams.filter((tm) => tm.id === state.user?.housekeepingTeamId);

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
    <div className="flex flex-col gap-4 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('housekeeping_teams_title')}</h2>

      {visibleTeams.map((team) => {
        const members = membersOf(team.id);
        const leads = members.filter((m) => m.teamRole === 'lead');
        const teamWorkload = workload.find((w) => w.teamId === team.id);
        return (
          <Card key={team.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{team.name}</span>
              {!team.active ? <Badge>{t('team_inactive_label')}</Badge> : null}
            </div>
            <p className="mt-1 text-[12.5px] text-muted">
              {t('team_member_count', { n: members.length })} · {t('team_lead_count', { n: leads.length })}
            </p>
            {propertiesOf(team.id).length > 0 ? (
              <p className="mt-1 text-[12.5px] text-muted">
                {t('team_responsible_for')}: {propertiesOf(team.id).map((code) => {
                  const prop = state.properties.find((p) => p.code === code);
                  return prop ? getPropertyDisplayName(prop) : code;
                }).join(', ')}
              </p>
            ) : null}

            <div className="mt-2.5 flex flex-col gap-1.5">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 text-[13px]">
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
              {members.length === 0 ? <p className="text-[12.5px] text-muted">{t('team_no_members')}</p> : null}
            </div>

            {teamWorkload ? (
              <div className="mt-2.5 border-t border-line/70 pt-2 text-[12.5px] text-muted">
                <p className="font-medium text-ink">{t('team_workload_today', { n: teamWorkload.total })}</p>
                {teamWorkload.perPerson.map((p) => (
                  <p key={p.housekeeperId || 'unassigned'}>
                    {p.housekeeperId ? p.housekeeperName : t('team_task_unclaimed')} · {p.count}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}

      {!admin && !lead ? <p className="text-[13px] text-muted">{t('team_no_access')}</p> : null}

      {admin ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{t('team_new_title')}</p>
            <div className="flex gap-2">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder={t('team_name_placeholder')}
                className="h-11 flex-1 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
              />
              <Button variant="primary" onClick={handleCreateTeam}>{t('team_create')}</Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{t('team_property_defaults_title')}</p>
            <div className="flex flex-col gap-1 rounded-control border border-line">
              {state.properties.map((p) => {
                const currentTeamId = state.teamPropertyDefaults[p.code] || '';
                return (
                  <div key={p.code} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                    <span className="truncate text-ink">{getPropertyDisplayName(p)}</span>
                    <select
                      value={currentTeamId}
                      onChange={(e) => setTeamPropertyDefault(p.code, e.target.value || null)}
                      className="rounded-control border border-line bg-warm-white px-2 py-1.5 text-[13px] text-ink"
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
          </div>
        </>
      ) : null}
    </div>
  );
}
