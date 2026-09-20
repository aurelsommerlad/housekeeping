import { STANDARD_DEPARTURE_TIME, STANDARD_ARRIVAL_TIME, EXTRA_TIME } from '@/lib/housekeeping/tasks';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';

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
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('standard_times_title')}</h2>
      <Card>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-ink">{t('standard_departure_label')}</p>
            <p className="font-medium text-ink">{STANDARD_DEPARTURE_TIME}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-ink">{t('standard_arrival_label')}</p>
            <p className="font-medium text-ink">{STANDARD_ARRIVAL_TIME}</p>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-ink">{t('standard_lco_label')}</p>
            <p className="font-medium text-ink">{EXTRA_TIME}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-ink">{t('standard_eci_label')}</p>
            <p className="font-medium text-ink">{EXTRA_TIME}</p>
          </div>
        </div>
      </Card>
      <p className="px-1 text-[13px] leading-relaxed text-muted">{t('standard_times_note')}</p>
    </div>
  );
}
