'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { getTeamMemberships, isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { AdminRow, AdminRowList, AdminSection } from './admin';

export interface PermissionsOverviewScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Teams & Benutzer > Berechtigungen - REIN LESENDE Uebersicht, ausschliesslich aus
 * bereits geladenem state.users/state.properties/state.teams abgeleitet (kein neuer API-Aufruf,
 * keine neue Mutationslogik). Bearbeiten bleibt ausschliesslich ueber "Mitarbeiter" (TeamScreen.tsx
 * -> UserFormSheet.tsx) moeglich - hier gibt es bewusst keine zweite, konkurrierende Bearbeitungs-
 * oberflaeche fuer Rolle/managedProperties/teamRole (keine neue Rollenlogik).
 */
export function PermissionsOverviewScreen({ app }: PermissionsOverviewScreenProps) {
  const { state, t } = app;
  const admins = state.users.filter((u) => isAdmin(u));
  const leads = state.users.filter((u) => isTeamLead(u));
  const managersByProperty = state.properties
    .map((p) => ({
      property: p,
      managers: state.users.filter((u) => !isAdmin(u) && (u.managedProperties || []).includes(p.code)),
    }))
    .filter((entry) => entry.managers.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{t('permissions_overview_note')}</p>

      <AdminSection eyebrow={t('permissions_admins_label')}>
        <AdminRowList>
          {admins.length === 0 ? (
            <AdminRow title={t('permissions_none')} />
          ) : (
            admins.map((u) => <AdminRow key={u.id} title={u.name} />)
          )}
        </AdminRowList>
      </AdminSection>

      <AdminSection eyebrow={t('permissions_managers_label')}>
        <AdminRowList>
          {managersByProperty.length === 0 ? (
            <AdminRow title={t('permissions_none')} />
          ) : (
            managersByProperty.map(({ property, managers }) => (
              <AdminRow
                key={property.code}
                title={getPropertyDisplayName(property)}
                description={managers.map((u) => u.name).join(', ')}
              />
            ))
          )}
        </AdminRowList>
      </AdminSection>

      <AdminSection eyebrow={t('permissions_leads_label')}>
        <AdminRowList>
          {leads.length === 0 ? (
            <AdminRow title={t('permissions_none')} />
          ) : (
            leads.map((u) => {
              // getTeamMemberships() statt der veralteten housekeepingTeamId (siehe permissions.ts)
              // - ein User kann Lead mehrerer Teams gleichzeitig sein (teamMemberships[]), die
              // veraltete Skalarform kennt nur ein einzelnes Team und wird bei jedem upsertUser
              // ohnehin geloescht.
              const leadTeamNames = getTeamMemberships(u)
                .filter((m) => m.isLeader)
                .map((m) => state.teams.find((tm) => tm.id === m.teamId)?.name)
                .filter((name): name is string => !!name);
              return <AdminRow key={u.id} title={u.name} description={leadTeamNames.join(' · ')} />;
            })
          )}
        </AdminRowList>
      </AdminSection>
    </div>
  );
}
