'use client';

import { useMemo, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { estimateLinenQuantity } from '@/lib/housekeeping/linen';
import type { LinenComplaintLine } from '@/lib/housekeeping/types';
import { BottomSheet } from './BottomSheet';
import { QuantityStepper } from './QuantityStepper';
import { Button } from '@/components/ui/Button';
import { IconAlertCircle, IconEdit } from '@/components/ui/icons';

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
 *
 * Briefing "Wäschereklamation erfassen": erweitert dieses BESTEHENDE Formular um eine optionale
 * Reklamationserfassung, statt eine zweite Artikelliste/ein zweites Formular zu bauen - dieselbe
 * property-gescopte Artikelliste (`linenItemsForProperty`) und derselbe QuantityStepper wie beim
 * Verbrauch oben, nur in einem eigenen, verschachtelten BottomSheet (spaeter im JSX, malt dadurch
 * ueber diesem Sheet). Reklamation und Verbrauch bleiben LOGISCH UND NUMERISCH GETRENNT: die
 * reklamierte Menge fliesst nie in `values`/den Verbrauchsreport ein und umgekehrt. Erst beim
 * finalen "Reinigung abschliessen" wird `laundryComplaints` gemeinsam mit dem Verbrauch an
 * finishTask() uebergeben - eine abgebrochene Reklamationserfassung aendert also nie den
 * Verbrauch, und ein abgebrochener Verbrauch (Backdrop/X) verwirft automatisch auch eine bereits
 * erfasste, aber noch nicht abgeschickte Reklamation (kein zweiter, unabhaengiger Speicherstand).
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

  // Wäschereklamation: `complaints` ist der bereits UEBERNOMMENE Stand (Anzeige im Hauptformular +
  // finale Uebergabe an finishTask), `complaintDraft` der Arbeitsstand INNERHALB des noch
  // geoeffneten Reklamations-Sheets - erst "Reklamation übernehmen" schreibt draft -> complaints.
  const [complaintSheetOpen, setComplaintSheetOpen] = useState(false);
  const [complaints, setComplaints] = useState<LinenComplaintLine[]>([]);
  const [complaintDraft, setComplaintDraft] = useState<Record<string, number>>({});

  if (!task) return null;

  const canSubmit = !submitting && items.every((item) => typeof values[item.id] === 'number');
  const complaintCount = complaints.reduce((sum, c) => sum + c.quantity, 0);

  function openComplaintForm() {
    // Punkt "alle Mengen-Stepper starten bei 0, niemals vorbefüllt": ausser bei einer Bearbeitung
    // einer bereits uebernommenen Reklamation - dort wird der vorhandene Stand wieder eingeblendet
    // (Punkt "editierbar/entfernbar, bevor die Reinigung final abgeschlossen wird").
    const draft: Record<string, number> = {};
    for (const item of items) draft[item.id] = complaints.find((c) => c.itemId === item.id)?.quantity ?? 0;
    setComplaintDraft(draft);
    setComplaintSheetOpen(true);
  }

  function applyComplaintForm() {
    const lines: LinenComplaintLine[] = items
      .filter((item) => (complaintDraft[item.id] ?? 0) > 0)
      .map((item) => ({ itemId: item.id, itemName: item.name, unit: item.unit, quantity: complaintDraft[item.id] }));
    setComplaints(lines);
    setComplaintSheetOpen(false);
  }

  function removeComplaint() {
    if (typeof window !== 'undefined' && !window.confirm(t('linen_complaint_remove_confirm'))) return;
    setComplaints([]);
  }

  async function handleSubmit() {
    if (!canSubmit || !task) return;
    setSubmitting(true);
    const linenItems = items.map((item) => ({
      itemId: item.id,
      estimatedQuantity: estimateLinenQuantity(item.estimationRule, task),
      actualQuantity: values[item.id] as number,
    }));
    const laundryComplaints = complaints.map((c) => ({ itemId: c.itemId, quantity: c.quantity }));
    await finishTask(task, linenItems, laundryComplaints);
    setSubmitting(false);
  }

  return (
    <>
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

        {items.length > 0 ? (
          complaints.length > 0 ? (
            // Briefing "Wäschereklamation erfassen": inline-Status statt eines zweiten,
            // eigenstaendigen Formularbereichs - dezent hervorgehoben (IconAlertCircle, dieselbe
            // zurueckhaltende Optik wie der bestehende "Wichtiger Hinweis"), bewusst KEINE grosse
            // rote Warnflaeche.
            <div className="mt-4 rounded-control border border-line bg-surface px-3.5 py-3">
              <div className="flex items-start gap-2">
                <IconAlertCircle width={15} height={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    {t('linen_complaint_status_label')} · {t('linen_complaint_status_summary', { n: complaintCount })}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    {complaints.map((c) => `${c.quantity}× ${c.itemName}`).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={openComplaintForm} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink underline underline-offset-2">
                  <IconEdit width={12} height={12} aria-hidden="true" />
                  {t('linen_complaint_edit_button')}
                </button>
                <button type="button" onClick={removeComplaint} className="text-[12.5px] text-muted underline underline-offset-2">
                  {t('linen_complaint_remove')}
                </button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="mt-4 w-full" onClick={openComplaintForm}>
              <IconAlertCircle width={15} height={15} aria-hidden="true" />
              {t('linen_complaint_button')}
            </Button>
          )
        ) : null}

        <Button variant="primary" className="mt-5 w-full" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? t('sending') : t('finish_clean')}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={closeLinenCompletion}>
          {t('cancel')}
        </Button>
      </BottomSheet>

      {/* Verschachteltes Sheet (Briefing "Bottom Sheet/Modal") - wird NACH dem Hauptformular
       * gerendert und liegt dadurch (gleicher `fixed inset-0`-Stacking-Kontext, spaetere DOM-
       * Position) sichtbar darueber, ohne BottomSheet.tsx selbst aendern zu muessen. */}
      <BottomSheet open={complaintSheetOpen} onClose={() => setComplaintSheetOpen(false)}>
        <h3 className="italic text-lg text-[#17160f]">{t('linen_complaint_title')}</h3>
        <p className="mt-1 text-[13px] text-muted">{t('linen_complaint_subtitle')}</p>

        <div className="mt-4 flex flex-col divide-y divide-line">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <p className="min-w-0 truncate text-[14px] font-medium text-ink">{item.name}</p>
              <QuantityStepper
                value={complaintDraft[item.id] ?? 0}
                onChange={(next) => setComplaintDraft((prev) => ({ ...prev, [item.id]: next }))}
                aria-label={item.name}
              />
            </div>
          ))}
        </div>

        <Button variant="primary" className="mt-5 w-full" onClick={applyComplaintForm}>
          {t('linen_complaint_apply')}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setComplaintSheetOpen(false)}>
          {t('cancel')}
        </Button>
      </BottomSheet>
    </>
  );
}
