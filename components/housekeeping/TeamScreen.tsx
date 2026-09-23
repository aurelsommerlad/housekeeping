'use client';

import { useEffect, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { Invitation, Role, StaffUser } from '@/lib/housekeeping/types';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import {
  canInviteUser, getTeamMemberships, isAdmin, isLocationManager, isTeamLead,
} from '@/lib/housekeeping/permissions';
import { Button } from '@/components/ui/Button';
import { IconTrash } from '@/components/ui/icons';
import { AdminBadge, AdminTable, type AdminTableColumn } from './admin';
import { HousekeepingTeamsScreen } from './HousekeepingTeamsScreen';
import { InviteUserSheet } from './InviteUserSheet';
import { UserFormSheet } from './UserFormSheet';
import { cn } from '@/lib/cn';

export interface TeamScreenProps {
  app: HousekeepingApp;
}

type StaffRow =
  | { kind: 'user'; key: string; user: StaffUser }
  | { kind: 'invitation'; key: string; invitation: Invitation };

function roleLabel(role: Role, t: HousekeepingApp['t']): string {
  return role === 'admin' ? t('role_admin') : role === 'location_manager' ? t('role_location_manager') : t('role_housekeeper');
}

/**
 * Team-/Benutzerverwaltung (Briefing "Team-/Benutzerverwaltung ueberarbeiten") - EIN Screen mit
 * drei je nach Rolle unterschiedlich weit gefassten Ansichten, KEIN separates Admin-Produkt:
 *
 * - Admin: volle Ansicht mit zwei Tabs ("Mitarbeiter"/"Reinigungsteams"), Suche/Filter,
 *   Desktop-Tabelle + Mobile-Karten (AdminTable), sieht/verwaltet alle Mitarbeiter und Teams.
 * - Standortverantwortlicher: dieselben zwei Tabs, aber auf eigene Standorte/Teams beschraenkt -
 *   kann einladen, aber weder bearbeiten noch deaktivieren (canManageUser bleibt admin-only).
 * - Teamleader (keine eigene Rolle - isTeamLead(user)): reduzierte "Mein Team"-Ansicht (nur
 *   Mitglieder der SELBST geleiteten Teams + "+ Mitarbeiter einladen"), kein Tab, keine
 *   Bearbeiten-Aktion, keine Reinigungsteams-Verwaltung.
 *
 * Jede tatsaechliche Rechtepruefung liegt serverseitig (api/users.js, api/invitations.js) - diese
 * Datei entscheidet nur, was fuer die jeweilige Rolle sinnvoll ANGEZEIGT wird.
 */
export function TeamScreen({ app }: TeamScreenProps) {
  const { state, t, loadInvitations, resendInvitation, revokeInvitation, showToast } = app;
  const actor = state.user;
  const admin = isAdmin(actor);
  const locationManager = !admin && isLocationManager(actor);
  const lead = !admin && !locationManager && isTeamLead(actor);
  const canInvite = canInviteUser(actor);

  const [tab, setTab] = useState<'members' | 'teams'>('members');
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (canInvite) loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!admin && !locationManager && !lead) {
    return <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 lg:px-8"><p className="text-sm text-muted">{t('team_no_access')}</p></div>;
  }

  const managedProperties = actor?.managedProperties || [];
  const ownTeamIds = new Set(getTeamMemberships(actor).filter((m) => m.isLeader).map((m) => m.teamId));

  const visibleUsers = admin
    ? state.users
    : locationManager
      ? state.users.filter((u) => u.role !== 'admin' && (
        u.properties === 'alle' || u.properties === 'all'
          ? true
          : (Array.isArray(u.properties) && u.properties.some((p) => managedProperties.includes(p)))
        || getTeamMemberships(u).some((m) => ownTeamIds.has(m.teamId) || (state.teams.find((tm) => tm.id === m.teamId)?.propertyIds || []).some((p) => managedProperties.includes(p)))
      ))
      : state.users.filter((u) => getTeamMemberships(u).some((m) => ownTeamIds.has(m.teamId)));

  // Server scoped bereits auf eigene Einladungen fuer nicht-Admin (siehe api/invitations.js GET) -
  // hier nur noch auf 'pending' filtern, da angenommene/widerrufene Einladungen entweder schon
  // als echter User-Datensatz erscheinen oder schlicht nicht mehr relevant sind.
  const pendingInvitations = Object.values(state.invitations).filter((inv) => inv.status === 'pending');

  const rows: StaffRow[] = [
    ...visibleUsers.map((user): StaffRow => ({ kind: 'user', key: `u:${user.id}`, user })),
    ...pendingInvitations.map((invitation): StaffRow => ({ kind: 'invitation', key: `i:${invitation.id}`, invitation })),
  ];

  function rowEmail(row: StaffRow): string {
    return row.kind === 'user' ? (row.user.email || '') : row.invitation.email;
  }
  function rowName(row: StaffRow): string {
    return row.kind === 'user' ? row.user.name : row.invitation.email;
  }
  function rowRole(row: StaffRow): Role {
    return row.kind === 'user' ? row.user.role : row.invitation.role;
  }
  function rowTeamIds(row: StaffRow): string[] {
    return row.kind === 'user' ? getTeamMemberships(row.user).map((m) => m.teamId) : (row.invitation.teamId ? [row.invitation.teamId] : []);
  }
  function rowProperties(row: StaffRow): 'alle' | 'all' | string[] {
    return row.kind === 'user' ? row.user.properties : row.invitation.propertyIds;
  }
  function rowStatus(row: StaffRow): 'active' | 'inactive' | 'invited' {
    if (row.kind === 'invitation') return 'invited';
    return row.user.active === false ? 'inactive' : 'active';
  }

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    if (query && !rowName(row).toLowerCase().includes(query) && !rowEmail(row).toLowerCase().includes(query)) return false;
    if (roleFilter && rowRole(row) !== roleFilter) return false;
    if (teamFilter && !rowTeamIds(row).includes(teamFilter)) return false;
    if (statusFilter && rowStatus(row) !== statusFilter) return false;
    if (propertyFilter) {
      const props = rowProperties(row);
      const hasProperty = props === 'alle' || props === 'all' ? true : Array.isArray(props) && props.includes(propertyFilter);
      if (!hasProperty) return false;
    }
    return true;
  });

  async function handleCopyInviteLink(invitation: Invitation) {
    const token = await resendInvitation(invitation.id);
    if (!token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
      showToast(t('invite_link_copied_toast'));
    } catch {
      showToast(t('invitation_resent_toast'));
    }
  }

  async function handleRevoke(invitation: Invitation) {
    if (typeof window !== 'undefined' && !window.confirm(t('invitation_revoke_confirm'))) return;
    const ok = await revokeInvitation(invitation.id);
    if (ok) showToast(t('invitation_revoked_toast'));
  }

  function locationsLabel(row: StaffRow): string {
    const props = rowProperties(row);
    if (props === 'alle' || props === 'all') return t('all_properties');
    if (!Array.isArray(props) || props.length === 0) return '—';
    return props.map((code) => {
      const prop = state.properties.find((p) => p.code === code);
      return prop ? getPropertyDisplayName(prop) : code;
    }).join(', ');
  }

  function teamsLabel(row: StaffRow): string {
    const ids = rowTeamIds(row);
    if (ids.length === 0) return '—';
    return ids.map((id) => state.teams.find((tm) => tm.id === id)?.name || id).join(', ');
  }

  function statusBadge(row: StaffRow) {
    const status = rowStatus(row);
    if (status === 'invited') return <AdminBadge label={t('status_invited_label')} tone="neutral" />;
    if (status === 'inactive') return <AdminBadge label={t('inactive_label')} tone="muted" />;
    return <AdminBadge label={t('active_label')} tone="positive" />;
  }

  function rowActions(row: StaffRow) {
    if (row.kind === 'user') {
      if (!admin) return null;
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(row.user)}>{t('edit')}</Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => handleCopyInviteLink(row.invitation)}>{t('invitation_copy_link_action')}</Button>
        <button
          type="button"
          onClick={() => handleRevoke(row.invitation)}
          className="text-muted transition-colors hover:text-status-attention"
          aria-label={t('invitation_revoke_action')}
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>
    );
  }

  const columns: AdminTableColumn<StaffRow>[] = [
    { key: 'name', header: t('team_tab_members'), render: (row) => <span className="font-medium text-ink">{rowName(row)}</span> },
    { key: 'role', header: t('role'), render: (row) => roleLabel(rowRole(row), t) },
    { key: 'team', header: t('team_label'), render: (row) => <span className="text-muted">{teamsLabel(row)}</span> },
    { key: 'locations', header: t('team_col_locations'), render: (row) => <span className="text-muted">{locationsLabel(row)}</span> },
    { key: 'status', header: t('team_col_status'), render: (row) => statusBadge(row) },
    { key: 'actions', header: '', render: (row) => rowActions(row), className: 'text-right' },
  ];

  const title = admin || locationManager ? t('team_title') : t('my_team_title');

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {canInvite ? <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>{t('invite_member_action')}</Button> : null}
      </div>

      {admin || locationManager ? (
        <div className="flex gap-2 border-b border-line">
          {(['members', 'teams'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={cn(
                '-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
                tab === tb ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {tb === 'members' ? t('team_tab_members') : t('team_tab_teams')}
            </button>
          ))}
        </div>
      ) : null}

      {(admin || locationManager) && tab === 'teams' ? (
        <HousekeepingTeamsScreen app={app} />
      ) : (
        <div className="flex flex-col gap-4">
          {admin || locationManager ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('team_search_placeholder')}
                className="h-10 min-w-[220px] flex-1 rounded-control border border-line bg-warm-white px-3 text-sm text-ink"
              />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-control border border-line bg-warm-white px-2.5 text-sm text-ink">
                <option value="">{t('team_filter_all_roles')}</option>
                <option value="admin">{t('role_admin')}</option>
                <option value="location_manager">{t('role_location_manager')}</option>
                <option value="housekeeper">{t('role_housekeeper')}</option>
              </select>
              <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="h-10 rounded-control border border-line bg-warm-white px-2.5 text-sm text-ink">
                <option value="">{t('team_filter_all_locations')}</option>
                {state.properties.map((p) => <option key={p.code} value={p.code}>{getPropertyDisplayName(p)}</option>)}
              </select>
              {state.teams.length > 0 ? (
                <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="h-10 rounded-control border border-line bg-warm-white px-2.5 text-sm text-ink">
                  <option value="">{t('team_filter_all_teams')}</option>
                  {state.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                </select>
              ) : null}
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-control border border-line bg-warm-white px-2.5 text-sm text-ink">
                <option value="">{t('team_filter_all_status')}</option>
                <option value="active">{t('active_label')}</option>
                <option value="invited">{t('status_invited_label')}</option>
                <option value="inactive">{t('inactive_label')}</option>
              </select>
            </div>
          ) : null}

          <AdminTable
            columns={columns}
            rows={filteredRows}
            rowKey={(row) => row.key}
            emptyMessage={t('team_no_results')}
            mobileRow={(row) => (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{rowName(row)}</p>
                    <p className="text-xs text-muted">{roleLabel(rowRole(row), t)}</p>
                  </div>
                  {statusBadge(row)}
                </div>
                <p className="text-xs text-muted">{teamsLabel(row)} · {locationsLabel(row)}</p>
                <div className="mt-1 flex items-center gap-3 border-t border-line pt-2">{rowActions(row)}</div>
              </div>
            )}
          />
        </div>
      )}

      {editing ? <UserFormSheet app={app} user={editing} onClose={() => setEditing(null)} /> : null}
      {inviting ? <InviteUserSheet app={app} onClose={() => setInviting(false)} /> : null}
    </div>
  );
}
