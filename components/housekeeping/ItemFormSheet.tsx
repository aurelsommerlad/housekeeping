'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { ConsumableItem, LinenEstimationRule, LinenItem, Property } from '@/lib/housekeeping/types';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

type CatalogKind = 'linen' | 'consumable';
type CatalogItem = LinenItem | ConsumableItem;

export interface ItemFormSheetProps {
  app: HousekeepingApp;
  kind: CatalogKind;
  item: CatalogItem | null;
  properties: Property[];
  /** Nur fuer eine NEUE Position (item === null) relevant, wenn das Formular aus einem
   * Property-Drilldown heraus geoeffnet wurde (Einstellungen > Standorte & Apartments >
   * <Property>) - so muss die zugehoerige Property nicht nochmal manuell angehakt werden. */
  defaultPropertyIds?: string[];
  onClose: () => void;
}

const RULE_TYPES: LinenEstimationRule['type'][] = ['none', 'perGuest', 'perAdult', 'fixed'];

function defaultRuleValue(type: LinenEstimationRule['type']): LinenEstimationRule {
  if (type === 'perGuest') return { type: 'perGuest', multiplier: 1 };
  if (type === 'perAdult') return { type: 'perAdult', multiplier: 1 };
  if (type === 'fixed') return { type: 'fixed', quantity: 1 };
  return { type: 'none' };
}

/**
 * Gemeinsames Formular fuer Waesche-/Bettsachen- UND Verbrauchsmaterial-Artikel (Briefing Punkt 6/
 * 12) - EINE Implementierung statt zweier fast identischer Formulare, nur der Schaetzregel-
 * Abschnitt ist ausschliesslich fuer `kind === 'linen'` sichtbar (Verbrauchsmaterial hat laut
 * Briefing keine sinnvolle Schaetzbasis). Wird von ItemCatalogSettingsScreen.tsx nur gemountet,
 * waehrend das Formular offen ist (frischer Zustand pro Oeffnen, analog zu UserFormSheet.tsx).
 */
export function ItemFormSheet({ app, kind, item, properties, defaultPropertyIds, onClose }: ItemFormSheetProps) {
  const { t, saveLinenItem, saveConsumableItem } = app;
  const [name, setName] = useState(item?.name || '');
  const [unit, setUnit] = useState(item?.unit || '');
  const [active, setActive] = useState(item?.active !== false);
  const [propertyIds, setPropertyIds] = useState<string[]>(item?.propertyIds || defaultPropertyIds || []);
  const linenItem = kind === 'linen' ? (item as LinenItem | null) : null;
  const [ruleType, setRuleType] = useState<LinenEstimationRule['type']>(linenItem?.estimationRule?.type || 'none');
  const [ruleValue, setRuleValue] = useState<number>(
    linenItem?.estimationRule && 'multiplier' in linenItem.estimationRule ? linenItem.estimationRule.multiplier
      : linenItem?.estimationRule && 'quantity' in linenItem.estimationRule ? linenItem.estimationRule.quantity
      : 1,
  );

  function toggleProperty(code: string) {
    setPropertyIds((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function buildEstimationRule(): LinenEstimationRule {
    const rule = defaultRuleValue(ruleType);
    if (rule.type === 'perGuest' || rule.type === 'perAdult') return { ...rule, multiplier: ruleValue };
    if (rule.type === 'fixed') return { ...rule, quantity: ruleValue };
    return rule;
  }

  async function handleSubmit() {
    if (!name.trim() || !unit.trim()) return;
    const base = { id: item?.id, name: name.trim(), unit: unit.trim(), active, propertyIds, sortOrder: item?.sortOrder };
    if (kind === 'linen') await saveLinenItem({ ...base, estimationRule: buildEstimationRule() });
    else await saveConsumableItem(base);
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{item ? item.name : t('catalog_new_item')}</h3>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('catalog_item_name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('catalog_item_unit')}
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t('catalog_item_unit_placeholder')}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('active_label')}
          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className={cn(
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
              active ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
            )}
          >
            {active ? t('active_label') : t('inactive_label')}
          </button>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('properties')}
          <div className="flex flex-wrap gap-2">
            {properties.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => toggleProperty(p.code)}
                className={cn(
                  'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                  propertyIds.includes(p.code) ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                )}
              >
                {getPropertyDisplayName(p)}
              </button>
            ))}
          </div>
        </div>

        {kind === 'linen' ? (
          <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            {t('catalog_estimation_rule')}
            <div className="flex flex-wrap gap-2">
              {RULE_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setRuleType(rt)}
                  className={cn(
                    'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                    ruleType === rt ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                  )}
                >
                  {t(`catalog_rule_${rt}` as I18nKey)}
                </button>
              ))}
            </div>
            {ruleType !== 'none' ? (
              <label className="mt-1 flex flex-col gap-1">
                {ruleType === 'fixed' ? t('catalog_rule_quantity_label') : t('catalog_rule_multiplier_label')}
                <input
                  type="number"
                  min={0}
                  step={ruleType === 'fixed' ? 1 : 0.5}
                  value={ruleValue}
                  onChange={(e) => setRuleValue(Number(e.target.value) || 0)}
                  className="h-10 w-24 rounded-control border border-line bg-warm-white px-3 text-[14px] text-ink"
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button variant="primary" className="mt-5 w-full" onClick={handleSubmit}>
        {t('save')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
