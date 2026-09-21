'use client';

import { useEffect } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface IncidentsOverviewScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Meldungen & Betrieb > Vorfaelle - admin-only Uebersicht der ueber "Vorfall
 * melden" eingegangenen Meldungen (api/incidents.js GET, siehe api/_incidents.js#getAllIncidents,
 * die bereits seit der urspruenglichen Implementierung existiert, aber bisher von keiner Route
 * aufgerufen wurde). Rein lesend - "Vorfall melden" selbst bleibt ausschliesslich eine operative
 * Aktion der Housekeeper (ReportIncidentSheet.tsx / "Melden"-Nav), NICHT Teil dieses Admin-Bereichs.
 */
export function IncidentsOverviewScreen({ app }: IncidentsOverviewScreenProps) {
  const { state, t, loadIncidentsList } = app;

  useEffect(() => {
    loadIncidentsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('incidents_overview_title')}</h2>

      {state.incidentsLoading && state.incidents.length === 0 ? (
        <p className="text-[13px] text-muted">{t('loading')}</p>
      ) : state.incidents.length === 0 ? (
        <p className="text-[13px] text-muted">{t('incidents_overview_empty')}</p>
      ) : (
        state.incidents.map((incident) => (
          <Card key={incident.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{incident.propertyName} · {incident.unitName}</span>
              <span className="text-[12px] text-muted">{new Date(incident.createdAt).toLocaleString(state.lang)}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{incident.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span>{incident.reportedByUserName}</span>
              {incident.housekeepingTeamName ? <span>· {incident.housekeepingTeamName}</span> : null}
              <span>· {incident.taskTypeLabel}</span>
              <Badge>
                {incident.slackDeliveryStatus === 'sent'
                  ? t('incidents_slack_sent')
                  : incident.slackDeliveryStatus === 'skipped'
                    ? t('incidents_slack_skipped')
                    : t('incidents_slack_failed')}
              </Badge>
            </div>
            {incident.photoUrls.length > 0 ? (
              <div className="mt-2.5 flex gap-2 overflow-x-auto">
                {incident.photoUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-16 w-16 shrink-0 rounded-control border border-line object-cover" />
                ))}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
