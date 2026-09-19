'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { PlaceholderSection } from '@/components/shell/PlaceholderSection';
import { DaySummary } from '@/components/rooms/DaySummary';
import { FilterBar, type RoomFilter } from '@/components/rooms/FilterBar';
import { UnitsGrid } from '@/components/rooms/UnitsGrid';
import { PROTOTYPE_PROPERTIES, PROTOTYPE_UNITS } from '@/lib/sample-data';
import type { NavItemId } from '@/lib/nav';

/**
 * UI-Prototyp der Zimmeruebersicht (Briefing Punkt 18, Schritt 6). Arbeitet ausschliesslich mit
 * lokalen Beispieldaten aus lib/sample-data.ts - keine Apaleo-/Redis-Anbindung, keine
 * persistente Housekeeping-Logik. Siehe MIGRATION_PLAN.md fuer die weiteren Schritte.
 */
export default function HousekeepingPrototypePage() {
  const [activePropertyId, setActivePropertyId] = useState(PROTOTYPE_PROPERTIES[0].id);
  const [activeNavId, setActiveNavId] = useState<NavItemId>('rooms');
  const [filter, setFilter] = useState<RoomFilter>('all');

  const propertyUnits = useMemo(
    () => PROTOTYPE_UNITS.filter((unit) => unit.propertyId === activePropertyId),
    [activePropertyId],
  );

  const filteredUnits = useMemo(() => {
    if (filter === 'all') return propertyUnits;
    if (filter === 'doubleup') return propertyUnits.filter((unit) => unit.needsDoubleUp);
    return propertyUnits.filter((unit) => unit.status === filter);
  }, [propertyUnits, filter]);

  return (
    <AppShell
      properties={PROTOTYPE_PROPERTIES}
      activePropertyId={activePropertyId}
      onPropertyChange={setActivePropertyId}
      activeNavId={activeNavId}
      onNavChange={setActiveNavId}
    >
      {activeNavId === 'rooms' ? (
        <>
          <DaySummary units={propertyUnits} />
          <FilterBar active={filter} onChange={setFilter} />
          <UnitsGrid units={filteredUnits} />
        </>
      ) : (
        <PlaceholderSection
          title={
            {
              stats: 'Statistik',
              doubleup: 'Aufdoppeln',
              rules: 'Regeln',
              team: 'Team',
            }[activeNavId as Exclude<NavItemId, 'rooms'>]
          }
        />
      )}
    </AppShell>
  );
}
