'use client';

import { useEffect } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { AdminBadge, AdminRow, AdminRowList, AdminSection } from './admin';

export interface IntegrationsScreenProps {
  app: HousekeepingApp;
}

/**
 * Einstellungen > Integrationen - zeigt AUSSCHLIESSLICH boolesche "konfiguriert"-
 * Statusinformationen (api/integrations-status.js), NIE Secrets/Tokens/Webhook-URLs selbst -
 * die bleiben ausschliesslich serverseitig in den jeweiligen env vars (siehe README.md). Weitere
 * Integrationen koennen spaeter einfach als weitere Rows ergaenzt werden.
 */
export function IntegrationsScreen({ app }: IntegrationsScreenProps) {
  const { state, t, loadIntegrationsStatusInfo } = app;

  useEffect(() => {
    loadIntegrationsStatusInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = state.integrationsStatus;
  const loading = state.integrationsStatusLoading && !status;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('integrations_note')}</p>
      <AdminSection>
        {loading ? (
          <p className="py-4 text-sm text-muted">{t('loading')}</p>
        ) : (
          <AdminRowList>
            <AdminRow
              title={t('integrations_apaleo_label')}
              badge={
                <AdminBadge
                  label={status?.apaleo.configured ? t('integrations_connected') : t('integrations_not_configured')}
                  tone={status?.apaleo.configured ? 'positive' : 'muted'}
                />
              }
            />
            <AdminRow
              title={t('integrations_slack_label')}
              badge={
                <AdminBadge
                  label={status?.slack.configured ? t('integrations_connected') : t('integrations_not_configured')}
                  tone={status?.slack.configured ? 'positive' : 'muted'}
                />
              }
            />
          </AdminRowList>
        )}
      </AdminSection>
    </div>
  );
}
