'use client';

import { useEffect } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { Card } from '@/components/ui/Card';

export interface ConsumableReportsOverviewScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Meldungen & Betrieb > Verbrauchsmeldungen - admin-only Uebersicht der
 * standortbezogenen Meldungen aus "Verbrauch melden" (api/consumables.js Action 'listReports',
 * siehe api/_consumables.js#getAllReports). Rein lesend, keine Bestandsfuehrung/Schwellenwerte
 * (Punkt 4 "explizit nicht jetzt") - "Verbrauch melden" selbst bleibt eine operative Aktion der
 * Housekeeper, nicht Teil dieses Admin-Bereichs.
 */
export function ConsumableReportsOverviewScreen({ app }: ConsumableReportsOverviewScreenProps) {
  const { state, t, loadConsumableReportsList } = app;

  useEffect(() => {
    loadConsumableReportsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function propertyLabel(code: string): string {
    const prop = state.properties.find((p) => p.code === code);
    return prop ? getPropertyDisplayName(prop) : code;
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('consumable_reports_overview_title')}</h2>

      {state.consumableReportsLoading && state.consumableReports.length === 0 ? (
        <p className="text-[13px] text-muted">{t('loading')}</p>
      ) : state.consumableReports.length === 0 ? (
        <p className="text-[13px] text-muted">{t('consumable_reports_overview_empty')}</p>
      ) : (
        state.consumableReports.map((report) => (
          <Card key={report.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{propertyLabel(report.propertyId)}</span>
              <span className="text-[12px] text-muted">{new Date(report.createdAt).toLocaleString(state.lang)}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">{report.reportedByUserName}</p>
            <div className="mt-2 flex flex-col gap-1">
              {report.items.map((line) => (
                <div key={line.itemId} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink">{line.itemName}</span>
                  <span className="font-medium text-ink">{line.quantity} {line.unit}</span>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
