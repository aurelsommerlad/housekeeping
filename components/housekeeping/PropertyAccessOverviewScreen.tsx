'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { hasPropertyAccess } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { Card } from '@/components/ui/Card';

export interface PropertyAccessOverviewScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Teams & Benutzer > Standortzuordnungen - REIN LESENDE Uebersicht (analog zu
 * PermissionsOverviewScreen.tsx): je Property, wer Zugriff hat. Ausschliesslich aus bereits
 * geladenem state.users/state.properties abgeleitet, keine neue Mutationslogik - Aendern bleibt
 * ueber "Mitarbeiter" (UserFormSheet.tsx, Feld `properties`).
 */
export function PropertyAccessOverviewScreen({ app }: PropertyAccessOverviewScreenProps) {
  const { state, t } = app;
  const allPropertiesUsers = state.users.filter((u) => u.properties === 'alle' || u.properties === 'all');

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('property_access_overview_title')}</h2>

      {allPropertiesUsers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{t('property_access_all_label')}</p>
          <Card>
            <div className="flex flex-col gap-1.5">
              {allPropertiesUsers.map((u) => (
                <p key={u.id} className="text-[14px] text-ink">{u.name}</p>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{t('property_access_per_property_label')}</p>
        {state.properties.map((property) => {
          const users = state.users.filter(
            (u) => Array.isArray(u.properties) && u.properties.includes(property.code) && hasPropertyAccess(u, property.code),
          );
          return (
            <Card key={property.code}>
              <p className="font-medium text-ink">{getPropertyDisplayName(property)}</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {users.length === 0 ? (
                  <p className="text-[13px] text-muted">{t('permissions_none')}</p>
                ) : (
                  users.map((u) => <p key={u.id} className="text-[13px] text-muted">{u.name}</p>)
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
