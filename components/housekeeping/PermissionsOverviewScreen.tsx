'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { Card } from '@/components/ui/Card';

export interface PermissionsOverviewScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Teams & Benutzer > Berechtigungen - REIN LESENDE Uebersicht, ausschliesslich aus
 * bereits geladenem state.users/state.properties/state.teams abgeleitet (kein neuer API-Aufruf,
 * keine neue Mutationslogik). Bearbeiten bleibt ausschliesslich ueber "Mitarbeiter" (TeamScreen.tsx
 * -> UserFormSheet.tsx) moeglich - hier gibt es bewusst keine zweite, konkurrierende Bearbeitungs-
 * oberflaeche fuer Rolle/managedProperties/teamRole (Punkt 10: keine neue Rollenlogik).
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
    <div className="flex flex-col gap-4 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('permissions_overview_title')}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{t('permissions_overview_note')}</p>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{t('permissions_admins_label')}</p>
        <Card>
          {admins.length === 0 ? (
            <p className="text-[13px] text-muted">{t('permissions_none')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {admins.map((u) => (
                <p key={u.id} className="text-[14px] text-ink">{u.name}</p>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{t('permissions_managers_label')}</p>
        {managersByProperty.length === 0 ? (
          <Card><p className="text-[13px] text-muted">{t('permissions_none')}</p></Card>
        ) : (
          managersByProperty.map(({ property, managers }) => (
            <Card key={property.code}>
              <p className="font-medium text-ink">{getPropertyDisplayName(property)}</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {managers.map((u) => (
                  <p key={u.id} className="text-[13px] text-muted">{u.name}</p>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{t('permissions_leads_label')}</p>
        <Card>
          {leads.length === 0 ? (
            <p className="text-[13px] text-muted">{t('permissions_none')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {leads.map((u) => {
                const team = state.teams.find((tm) => tm.id === u.housekeepingTeamId);
                return (
                  <p key={u.id} className="text-[14px] text-ink">
                    {u.name}
                    {team ? <span className="text-muted"> · {team.name}</span> : null}
                  </p>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
