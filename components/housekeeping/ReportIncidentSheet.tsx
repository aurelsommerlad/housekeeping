'use client';

import { useMemo, useRef, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { ResolvedTask } from '@/lib/housekeeping/tasks';
import { todayISO } from '@/lib/housekeeping/rooms';
import { compressImageFile } from '@/lib/housekeeping/image';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { IconAlertCircle, IconCheck, IconChevronDown, IconClose, IconPlus } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface ReportIncidentSheetProps {
  app: HousekeepingApp;
}

const MAX_PHOTOS = 5;

interface PhotoSlot {
  id: string;
  previewUrl: string;
  uploading: boolean;
  url: string | null;
  error: string | null;
}

/**
 * "Vorfall melden" (Briefing) - EIN kompaktes Formular (Reinigung -> Foto -> Beschreibung ->
 * Senden), kein Ticketsystem. Wird von der Elternkomponente NUR gemountet, waehrend das Sheet
 * offen ist (analog zu UserFormSheet.tsx) - dadurch startet jedes Oeffnen automatisch mit
 * frischem, leerem Formularzustand, ohne einen expliziten Reset-Effekt zu brauchen.
 *
 * Fotos werden EINZELN sofort nach Auswahl hochgeladen (client-seitig komprimiert, siehe
 * lib/housekeeping/image.ts) - beim Absenden liegen bereits alle Vercel-Blob-URLs vor, der
 * eigentliche "Vorfall senden"-Request enthaelt nur noch Text + URLs, kein Bildmaterial mehr.
 */
export function ReportIncidentSheet({ app }: ReportIncidentSheetProps) {
  const { state, t, closeIncidentReport, uploadIncidentPhoto, reportIncident, tasksForDayAll } = app;
  const presetTaskId = state.incidentPresetTaskId;
  const today = todayISO();

  const [taskId, setTaskId] = useState<string | null>(presetTaskId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slackDelivered: boolean } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Punkt 3: nur heutige Reinigungen, auf die der Benutzer laut bestehender Berechtigungslogik
  // ohnehin schon Zugriff hat (dieselbe Datengrundlage wie die Aufgaben-Ansicht selbst, siehe
  // tasksForDayAll) - "vorzugsweise eigene/Team-Reinigungen" wird hier rein als Sortierung
  // umgesetzt, nicht als zusaetzliche Zugriffssperre (die Aufgaben-Liste selbst kennt ebenfalls
  // keine Team-Sichtbarkeitssperre, siehe useHousekeepingApp.ts#tasksForDay).
  const todaysTasks = useMemo(() => {
    const all = tasksForDayAll(today);
    const userId = state.user?.id;
    const teamId = state.user?.housekeepingTeamId;
    const rank = (task: ResolvedTask) => (task.assignedUserId === userId ? 0 : task.assignedTeamId && task.assignedTeamId === teamId ? 1 : 2);
    return [...all].sort((a, b) => rank(a) - rank(b));
  }, [tasksForDayAll, today, state.user]);

  const selectedTask = taskId ? todaysTasks.find((tk) => tk.id === taskId) || null : null;
  const isPreset = !!presetTaskId;

  function addFiles(files: FileList | null) {
    if (!files || !taskId) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, Math.max(0, remaining));
    for (const file of toAdd) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      (async () => {
        try {
          const dataUrl = await compressImageFile(file);
          setPhotos((prev) => [...prev, { id, previewUrl: dataUrl, uploading: true, url: null, error: null }]);
          const url = await uploadIncidentPhoto(taskId, dataUrl);
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, uploading: false, url, error: url ? null : t('incident_photo_upload_failed') } : p)));
        } catch {
          setPhotos((prev) => [...prev, { id, previewUrl: '', uploading: false, url: null, error: t('incident_photo_upload_failed') }]);
        }
      })();
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  const uploadedUrls = photos.filter((p) => p.url).map((p) => p.url as string);
  const hasPendingUpload = photos.some((p) => p.uploading);
  const canSubmit = !!taskId && uploadedUrls.length > 0 && !hasPendingUpload && description.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !taskId || !selectedTask) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await reportIncident({
      taskId,
      description: description.trim(),
      photoUrls: uploadedUrls,
      propertyName: selectedTask.propertyName,
      unitName: selectedTask.unitName,
    });
    setSubmitting(false);
    if (!res) { setSubmitError(t('incident_submit_failed')); return; }
    setResult({ slackDelivered: res.slackDelivered });
  }

  function handleClose() {
    closeIncidentReport();
  }

  if (result) {
    return (
      <BottomSheet open onClose={handleClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sage/15 text-sage">
            <IconCheck width={24} height={24} aria-hidden="true" />
          </span>
          <h3 className="italic text-lg text-[#17160f]">{t('incident_success_title')}</h3>
          <p className="text-[14px] text-muted">{t('incident_success_body')}</p>
          <Button variant="primary" className="mt-3 w-full" onClick={handleClose}>
            {t('incident_back_to_tasks')}
          </Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open onClose={handleClose}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 italic text-lg text-[#17160f]">
          <IconAlertCircle width={19} height={19} className="text-status-attention" aria-hidden="true" />
          {t('report_incident_title')}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('close')}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <IconClose width={18} height={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-medium text-muted">{t('incident_task_label')} *</p>
          {isPreset && selectedTask ? (
            <div className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2.5 text-[14px] text-ink">
              <span className="truncate">{selectedTask.unitName} · {selectedTask.propertyName}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center justify-between rounded-control border border-line bg-warm-white px-3 py-2.5 text-left text-[14px] text-ink"
              >
                <span className={cn('truncate', !selectedTask && 'text-muted')}>
                  {selectedTask ? `${selectedTask.unitName} · ${selectedTask.propertyName}` : t('incident_task_placeholder')}
                </span>
                <IconChevronDown width={16} height={16} className={cn('shrink-0 text-muted transition-transform', pickerOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {pickerOpen ? (
                <div className="flex max-h-48 flex-col overflow-y-auto rounded-control border border-line">
                  {todaysTasks.length === 0 ? (
                    <p className="px-3 py-2.5 text-[13px] text-muted">{t('incident_no_tasks_today')}</p>
                  ) : (
                    todaysTasks.map((tk) => (
                      <button
                        key={tk.id}
                        type="button"
                        onClick={() => { setTaskId(tk.id); setPickerOpen(false); }}
                        className={cn(
                          'flex items-center justify-between px-3 py-2.5 text-left text-[14px] transition-colors',
                          tk.id === taskId ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
                        )}
                      >
                        <span className="truncate">{tk.unitName} · {tk.propertyName}</span>
                        {tk.id === taskId ? <IconCheck width={15} height={15} className="shrink-0" aria-hidden="true" /> : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-medium text-muted">{t('incident_photos_label')} *</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control border border-line bg-surface">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- lokale/base64-Vorschau, kein Next-Image-Loader noetig
                  <img src={p.previewUrl} alt="" className={cn('h-full w-full object-cover', p.uploading && 'opacity-50')} />
                ) : null}
                {p.uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">{t('incident_uploading')}</span>
                ) : null}
                {p.error ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-status-attention-bg/90 p-1 text-center text-[9px] text-status-attention">
                    {p.error}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label={t('remove')}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-warm-white"
                >
                  <IconClose width={11} height={11} aria-hidden="true" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && taskId ? (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <IconPlus width={18} height={18} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-tight">{t('incident_take_photo')}</span>
              </button>
            ) : null}
          </div>
          {!taskId ? <p className="text-[12px] text-muted">{t('incident_select_task_first')}</p> : null}
          {taskId && photos.length < MAX_PHOTOS ? (
            <button type="button" onClick={() => galleryInputRef.current?.click()} className="self-start text-[12.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
              {t('incident_choose_photo')}
            </button>
          ) : null}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('incident_description_label')} *
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('incident_description_placeholder')}
            rows={4}
            className="w-full resize-none rounded-control border border-line bg-warm-white px-3 py-2.5 text-[14px] text-ink"
          />
        </label>

        {submitError ? <p className="text-[13px] text-status-attention">{submitError}</p> : null}

        <Button variant="primary" className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? t('sending') : t('incident_send')}
        </Button>
      </div>
    </BottomSheet>
  );
}
