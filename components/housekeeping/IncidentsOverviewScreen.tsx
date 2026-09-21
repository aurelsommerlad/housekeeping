'use client';

import { useEffect } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';
import { AdminBadge } from './admin';

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
    <div className="flex flex-col gap-3">
      {state.incidentsLoading && state.incidents.length === 0 ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : state.incidents.length === 0 ? (
        <p className="text-sm text-muted">{t('incidents_overview_empty')}</p>
      ) : (
        state.incidents.map((incident) => (
          <Card key={incident.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{incident.propertyName} · {incident.unitName}</span>
              <span className="text-xs text-muted">{new Date(incident.createdAt).toLocaleString(state.lang)}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink">{incident.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{incident.reportedByUserName}</span>
              {incident.housekeepingTeamName ? <span>· {incident.housekeepingTeamName}</span> : null}
              <span>· {incident.taskTypeLabel}</span>
              <AdminBadge
                label={
                  incident.slackDeliveryStatus === 'sent'
                    ? t('incidents_slack_sent')
                    : incident.slackDeliveryStatus === 'skipped'
                      ? t('incidents_slack_skipped')
                      : t('incidents_slack_failed')
                }
                tone={incident.slackDeliveryStatus === 'sent' ? 'positive' : incident.slackDeliveryStatus === 'skipped' ? 'muted' : 'strong'}
              />
            </div>
            {incident.photoUrls.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {incident.photoUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover" />
                ))}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
