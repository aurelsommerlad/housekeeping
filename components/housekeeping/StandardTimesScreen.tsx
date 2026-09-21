import { STANDARD_DEPARTURE_TIME, STANDARD_ARRIVAL_TIME, EXTRA_TIME } from '@/lib/housekeeping/tasks';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { AdminField, AdminFieldGrid, AdminSection } from './admin';

export interface StandardTimesScreenProps {
  app: HousekeepingApp;
}

/**
 * Rein informative Anzeige der Standardzeiten (Business Rules aus tasks.ts) - keine eigene
 * Konfigurationsquelle. Eine einzelne An-/Abreisezeit wird weiterhin nur an der jeweiligen
 * Aufgabe geaendert (siehe standard_times_note).
 */
export function StandardTimesScreen({ app }: StandardTimesScreenProps) {
  const { t } = app;

  return (
    <AdminSection>
      <AdminFieldGrid>
        <AdminField label={t('standard_departure_label')} value={STANDARD_DEPARTURE_TIME} />
        <AdminField label={t('standard_arrival_label')} value={STANDARD_ARRIVAL_TIME} />
        <AdminField label={t('standard_lco_label')} value={EXTRA_TIME} />
        <AdminField label={t('standard_eci_label')} value={EXTRA_TIME} />
      </AdminFieldGrid>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">{t('standard_times_note')}</p>
    </AdminSection>
  );
}
