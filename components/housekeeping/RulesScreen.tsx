import { FORCED_CLEAN_INTERVAL_NIGHTS } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { Card } from '@/components/ui/Card';

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
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="font-heading text-lg italic text-ink">{t('rules_title')}</h2>
      {RULES.map((rule) => (
        <Card key={rule.titleKey}>
          <p className="font-medium text-ink">{t(rule.titleKey)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t(rule.descKey, rule.vars)}</p>
        </Card>
      ))}
    </div>
  );
}
