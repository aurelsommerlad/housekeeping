'use client';

import { useEffect } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';

export interface IntegrationsScreenProps {
  app: HousekeepingApp;
}

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${configured ? 'bg-sage' : 'bg-status-blocked'}`}
    />
  );
}

/**
 * Einstellungen > Integrationen (Punkt 5) - zeigt AUSSCHLIESSLICH boolesche "konfiguriert"-
 * Statusinformationen (api/integrations-status.js), NIE Secrets/Tokens/Webhook-URLs selbst -
 * die bleiben ausschliesslich serverseitig in den jeweiligen env vars (siehe README.md). Weitere
 * Integrationen koennen spaeter einfach als weitere Zeilen ergaenzt werden.
 */
export function IntegrationsScreen({ app }: IntegrationsScreenProps) {
  const { state, t, loadIntegrationsStatusInfo } = app;

  useEffect(() => {
    loadIntegrationsStatusInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = state.integrationsStatus;

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('settings_cat_integrations_title')}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{t('integrations_note')}</p>

      {state.integrationsStatusLoading && !status ? (
        <p className="text-[13px] text-muted">{t('loading')}</p>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{t('integrations_apaleo_label')}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-muted">
                <StatusDot configured={!!status?.apaleo.configured} />
                {status?.apaleo.configured ? t('integrations_connected') : t('integrations_not_configured')}
              </span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{t('integrations_slack_label')}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-muted">
                <StatusDot configured={!!status?.slack.configured} />
                {status?.slack.configured ? t('integrations_connected') : t('integrations_not_configured')}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
