'use client';

import { useMemo, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { estimateLinenQuantity } from '@/lib/housekeeping/linen';
import { BottomSheet } from './BottomSheet';
import { QuantityStepper } from './QuantityStepper';
import { Button } from '@/components/ui/Button';

export interface LinenCompletionSheetProps {
  app: HousekeepingApp;
}

/**
 * Verpflichtendes Waescheverbrauch-Formular VOR dem eigentlichen Reinigungsabschluss (Briefing
 * "Waescheverbrauch erfassen") - wird von TaskDetailSheet.tsx ausschliesslich ueber
 * app.openLinenCompletion(task) geoeffnet und von der Elternkomponente nur gemountet, waehrend
 * state.linenCompletionTaskId gesetzt ist (frischer Formularzustand bei jedem Oeffnen, analog zu
 * UserFormSheet.tsx/ReportIncidentSheet.tsx).
 *
 * Abbruch (Backdrop/X) ruft AUSSCHLIESSLICH closeLinenCompletion() - kein Aufruf von finishTask(),
 * der Timer/Status der Reinigung bleibt dadurch strukturell unangetastet (Briefing Punkt 9).
 */
export function LinenCompletionSheet({ app }: LinenCompletionSheetProps) {
  const { state, t, closeLinenCompletion, finishTask, linenItemsForProperty } = app;
  const taskId = state.linenCompletionTaskId;
  const task = useMemo(
    () => state.planningDays.flatMap((d) => app.tasksForDayAll(d)).find((tk) => tk.id === taskId) || null,
    [state.planningDays, app, taskId],
  );

  const items = task ? linenItemsForProperty(task.propertyCode) : [];
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!task) return null;

  const canSubmit = !submitting && items.every((item) => typeof values[item.id] === 'number');

  async function handleSubmit() {
    if (!canSubmit || !task) return;
    setSubmitting(true);
    const linenItems = items.map((item) => ({
      itemId: item.id,
      estimatedQuantity: estimateLinenQuantity(item.estimationRule, task),
      actualQuantity: values[item.id] as number,
    }));
    await finishTask(task, linenItems);
    setSubmitting(false);
  }

  return (
    <BottomSheet open onClose={closeLinenCompletion}>
      <h3 className="italic text-lg text-[#17160f]">{t('linen_completion_title')}</h3>
      <p className="mt-1 text-[13px] text-muted">{task.unitName} · {task.propertyName}</p>

      <div className="mt-4 flex flex-col divide-y divide-line">
        {items.map((item) => {
          const estimate = estimateLinenQuantity(item.estimationRule, task);
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">{item.name}</p>
                {/* Punkt 3: sehr dezent, hell greige hinterlegt, keine Warnfarbe - dient
                 * ausschliesslich als Orientierung und wird NIE automatisch uebernommen. */}
                <span className="mt-0.5 inline-block rounded-control bg-surface px-1.5 py-0.5 text-[11px] text-muted">
                  {t('linen_estimated_label')}: {estimate ?? '–'}
                </span>
              </div>
              <QuantityStepper
                value={values[item.id] ?? null}
                onChange={(next) => setValues((prev) => ({ ...prev, [item.id]: next }))}
                aria-label={item.name}
              />
            </div>
          );
        })}
      </div>

      <Button variant="primary" className="mt-5 w-full" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? t('sending') : t('finish_clean')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={closeLinenCompletion}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
