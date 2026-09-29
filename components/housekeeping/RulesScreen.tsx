import { FORCED_CLEAN_INTERVAL_NIGHTS } from '@/lib/housekeeping/api';
import { FORCED_CLEAN_ENABLED, INSPECTION_ENABLED } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { AdminRow, AdminRowList, AdminSection } from './admin';

export interface RulesScreenProps {
  app: HousekeepingApp;
}

// Zwangsreinigung/Inspektion aktuell deaktiviert (siehe rooms.ts) - die zugehoerigen Regeln daher
// ausgeblendet, damit hier nichts angezeigt wird, was gerade nicht angewendet wird.
const RULES: { titleKey: I18nKey; descKey: I18nKey; vars?: Record<string, number> }[] = [
  ...(FORCED_CLEAN_ENABLED ? [{ titleKey: 'rule_forced_t' as const, descKey: 'rule_forced_d' as const, vars: { n: FORCED_CLEAN_INTERVAL_NIGHTS } }] : []),
  { titleKey: 'rule_dirty_t', descKey: 'rule_dirty_d' },
  ...(INSPECTION_ENABLED ? [{ titleKey: 'rule_inspect_t' as const, descKey: 'rule_inspect_d' as const }] : []),
  { titleKey: 'rule_turnover_t', descKey: 'rule_turnover_d' },
];

/** Statische Regel-Uebersicht (nur fuer Admins ueber die Navigation erreichbar) - unveraendert. */
export function RulesScreen({ app }: RulesScreenProps) {
  const { t } = app;
  return (
    <AdminSection>
      <AdminRowList>
        {RULES.map((rule) => (
          <AdminRow key={rule.titleKey} title={t(rule.titleKey)} description={t(rule.descKey, rule.vars)} />
        ))}
      </AdminRowList>
    </AdminSection>
  );
}
