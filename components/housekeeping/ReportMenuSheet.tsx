'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { IconAlertCircle, IconLayers } from '@/components/ui/icons';

export interface ReportMenuSheetProps {
  app: HousekeepingApp;
}

/**
 * "Melden"-Sammelpunkt (Briefing Punkt 14) - fasst die beiden fachlich unterschiedlichen Melde-
 * Funktionen unter EINEM Bottom-Nav-Punkt zusammen, statt fuer jede einen eigenen zu belegen:
 * "Vorfall melden" bleibt apartment-/reinigungsbezogen (Foto + Beschreibung, siehe
 * ReportIncidentSheet.tsx), "Verbrauch melden" ist rein standortbezogen (siehe
 * ReportConsumableSheet.tsx) - beide Prozesse duerfen sich laut Briefing nie vermischen, dieses
 * Sheet ist nur ein gemeinsamer Einstiegspunkt, keine gemeinsame Datenstruktur.
 */
export function ReportMenuSheet({ app }: ReportMenuSheetProps) {
  const { state, t, closeReportMenu, openIncidentReport, openConsumableReport } = app;

  return (
    <BottomSheet open={state.reportMenuOpen} onClose={closeReportMenu}>
      <h3 className="italic text-lg text-[#17160f]">{t('report_menu_title')}</h3>
      <div className="mt-3 flex flex-col divide-y divide-line border-y border-line">
        <button
          type="button"
          onClick={() => { closeReportMenu(); openIncidentReport(); }}
          className="flex items-center gap-3 py-3.5 text-left text-[15px] text-ink transition-colors hover:text-sage"
        >
          <IconAlertCircle width={18} height={18} className="shrink-0 text-muted" aria-hidden="true" />
          {t('report_incident_title')}
        </button>
        <button
          type="button"
          onClick={openConsumableReport}
          className="flex items-center gap-3 py-3.5 text-left text-[15px] text-ink transition-colors hover:text-sage"
        >
          <IconLayers width={18} height={18} className="shrink-0 text-muted" aria-hidden="true" />
          {t('report_consumable_title')}
        </button>
      </div>
    </BottomSheet>
  );
}
