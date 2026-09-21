import { FORCED_CLEAN_INTERVAL_NIGHTS } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { AdminRow, AdminRowList, AdminSection } from './admin';

export interface RulesScreenProps {
  app: HousekeepingApp;
}

const RULES: { titleKey: I18nKey; descKey: I18nKey; vars?: Record<string, number> }[] = [
  { titleKey: 'rule_forced_t', descKey: 'rule_forced_d', vars: { n: FORCED_CLEAN_INTERVAL_NIGHTS } },
  { titleKey: 'rule_dirty_t', descKey: 'rule_dirty_d' },
  { titleKey: 'rule_inspect_t', descKey: 'rule_inspect_d' },
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
