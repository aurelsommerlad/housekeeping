'use client';

import { useMemo, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { BottomSheet } from './BottomSheet';
import { QuantityStepper } from './QuantityStepper';
import { Button } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface ReportConsumableSheetProps {
  app: HousekeepingApp;
}

/**
 * "Verbrauch melden" (Briefing Punkt 10/11) - AUSSCHLIESSLICH standortbezogen: kein Apartment,
 * keine Reinigung, keine Task-ID. Ein Mitarbeiter mit Zugriff auf nur einen Standort bekommt ihn
 * automatisch vorausgewaehlt (Punkt 11); bei mehreren muss er selbst waehlen, aber ausschliesslich
 * unter seinen berechtigten Standorten (dieselbe allowedProperties()-Logik wie ueberall sonst).
 * Wird nur gemountet, waehrend state.consumableReportOpen true ist - frischer Formularzustand bei
 * jedem Oeffnen (siehe LinenCompletionSheet.tsx/UserFormSheet.tsx fuer dasselbe Muster).
 */
export function ReportConsumableSheet({ app }: ReportConsumableSheetProps) {
  const { state, t, closeConsumableReport, consumableItemsForProperty, submitConsumableReport, showToast } = app;
  const allowedCodes = useMemo(
    () => allowedProperties(state.user, state.properties.map((p) => p.code)),
    [state.user, state.properties],
  );
  const [propertyCode, setPropertyCode] = useState<string | null>(allowedCodes.length === 1 ? allowedCodes[0] : null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(false);

  const items = propertyCode ? consumableItemsForProperty(propertyCode) : [];
  // Punkt "kompakter Report statt Nullenflut": nur tatsaechlich beruehrte (>0) Mengen zaehlen -
  // ein Stepper, der auf 0 stehen bleibt, gilt als "nichts gemeldet", nicht als "0 verbraucht"
  // (anders als bei Waesche gibt es hier keine verpflichtende Vollstaendigkeit, siehe Briefing
  // Punkt 11 - Verbrauchsmeldung ist ein optionales, schnelles Protokoll).
  const hasAnyQuantity = Object.values(quantities).some((q) => q > 0);
  const canSubmit = !!propertyCode && hasAnyQuantity && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !propertyCode) return;
    setSubmitting(true);
    const payload = items
      .map((item) => ({ itemId: item.id, quantity: quantities[item.id] || 0 }))
      .filter((entry) => entry.quantity > 0);
    const report = await submitConsumableReport(propertyCode, payload);
    setSubmitting(false);
    if (report) {
      setResult(true);
      showToast(t('saved'));
    }
  }

  function handleClose() {
    closeConsumableReport();
  }

  if (result) {
    return (
      <BottomSheet open onClose={handleClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/15 text-sage">
            <IconCheck width={24} height={24} aria-hidden="true" />
          </span>
          <h3 className="italic text-lg text-[#17160f]">{t('consumable_success_title')}</h3>
          <Button variant="primary" className="mt-3 w-full" onClick={handleClose}>
            {t('incident_back_to_tasks')}
          </Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open onClose={handleClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('report_consumable_title')}</h3>

      <div className="mt-4 flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-muted">{t('location_label')}</p>
        {allowedCodes.length === 0 ? (
          <p className="text-[14px] text-muted">{t('consumable_no_property_access')}</p>
        ) : allowedCodes.length === 1 ? (
          <p className="text-[14px] text-ink">
            {getPropertyDisplayName(state.properties.find((p) => p.code === propertyCode) || { code: propertyCode as string, name: propertyCode as string })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allowedCodes.map((code) => {
              const prop = state.properties.find((p) => p.code === code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPropertyCode(code)}
                  className={cn(
                    'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                    propertyCode === code ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                  )}
                >
                  {prop ? getPropertyDisplayName(prop) : code}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {propertyCode ? (
        <div className="mt-4 flex flex-col divide-y divide-line">
          {items.length === 0 ? (
            <p className="py-3 text-[13px] text-muted">{t('consumable_no_items')}</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <p className="min-w-0 truncate text-[14px] font-medium text-ink">{item.name}</p>
                <QuantityStepper
                  value={quantities[item.id] ?? 0}
                  onChange={(next) => setQuantities((prev) => ({ ...prev, [item.id]: next }))}
                  aria-label={item.name}
                />
              </div>
            ))
          )}
        </div>
      ) : null}

      <Button variant="primary" className="mt-5 w-full" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? t('sending') : t('report_consumable_button')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={handleClose}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
