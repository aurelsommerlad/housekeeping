'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { hasPropertyAccess } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { AdminRow, AdminRowList, AdminSection } from './admin';

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
    <div className="flex flex-col gap-6">
      {allPropertiesUsers.length > 0 ? (
        <AdminSection eyebrow={t('property_access_all_label')}>
          <AdminRowList>
            {allPropertiesUsers.map((u) => (
              <AdminRow key={u.id} title={u.name} />
            ))}
          </AdminRowList>
        </AdminSection>
      ) : null}

      <AdminSection eyebrow={t('property_access_per_property_label')}>
        <AdminRowList>
          {state.properties.map((property) => {
            const users = state.users.filter(
              (u) => Array.isArray(u.properties) && u.properties.includes(property.code) && hasPropertyAccess(u, property.code),
            );
            return (
              <AdminRow
                key={property.code}
                title={getPropertyDisplayName(property)}
                description={users.length === 0 ? t('permissions_none') : users.map((u) => u.name).join(', ')}
              />
            );
          })}
        </AdminRowList>
      </AdminSection>
    </div>
  );
}
