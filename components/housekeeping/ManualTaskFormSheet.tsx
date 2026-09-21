'use client';

import { useState } from 'react';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { allowedProperties, todayISO } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface ManualTaskFormSheetProps {
  app: HousekeepingApp;
}

/**
 * "+ Aufgabe erstellen" (Punkt "Admin kann Aufgaben erstellen") - admin-only Formular fuer eine
 * manuelle, nicht aus Apaleo abgeleitete Aufgabe (Titel/Beschreibung/Datum, Apartment und
 * Zuweisung optional). Rein additiv: nutzt ausschliesslich die bereits geladenen Standorte/
 * Apartments/Mitarbeiter (state.properties/planningUnits/users), keine eigene Datenquelle. Wird
 * dauerhaft gemountet (anders als UserFormSheet), da es ueber `state.manualTaskFormOpen` aus
 * mehreren Stellen (aktuell TasksScreen) geoeffnet werden kann.
 */
export function ManualTaskFormSheet({ app }: ManualTaskFormSheetProps) {
  const { state, t, closeManualTaskForm, createManualTask, shortStaffName } = app;
  const open = state.manualTaskFormOpen;
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const properties = state.properties.filter((p) => allowed.includes(p.code));

  // Vorbelegung mit dem aktuell gewaehlten Standortfilter (sofern kein "Alle") - die Apartment-
  // Liste (state.planningUnits) ist naemlich nur fuer den aktuellen Standort-Scope geladen (Punkt
  // 30/31 "kein Request mehr als noetig"); waehlt der Admin hier bewusst ein ANDERES Property,
  // steht "Apartment" bis zum naechsten Laden nur als "kein bestimmtes Apartment" zur Verfuegung.
  const [propertyCode, setPropertyCode] = useState<string>(state.propertyScope !== 'all' ? state.propertyScope : '');
  const [unitId, setUnitId] = useState<string>('');
  const [date, setDate] = useState<string>(todayISO());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPropertyCode(''); setUnitId(''); setDate(todayISO()); setTitle(''); setDescription(''); setAssignedUserId('');
  }

  function handleClose() {
    reset();
    closeManualTaskForm();
  }

  const units = propertyCode
    ? state.planningUnits
      .filter((u) => (u.property?.code || u.property?.id) === propertyCode)
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true }))
    : [];

  const assignableUsers = propertyCode
    ? state.users.filter((u) => u.role !== 'admin' && (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(propertyCode))))
    : [];

  const canSubmit = !!propertyCode && !!date && title.trim().length > 0 && description.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const property = properties.find((p) => p.code === propertyCode);
    const unit = units.find((u) => u.id === unitId);
    const assignee = assignableUsers.find((u) => u.id === assignedUserId);
    await createManualTask({
      propertyCode,
      propertyName: property ? getPropertyDisplayName(property) : propertyCode,
      unitId: unitId || null,
      unitName: unit ? String(unit.name || unit.id) : null,
      date,
      title: title.trim(),
      description: description.trim(),
      assignedUserId: assignee ? assignee.id : null,
      assignedUserName: assignee ? assignee.name : null,
    });
    setSubmitting(false);
    reset();
  }

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('create_manual_task_action')}</h3>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('label_property')}
          <div className="flex flex-wrap gap-2">
            {properties.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => { setPropertyCode(p.code); setUnitId(''); setAssignedUserId(''); }}
                className={cn(
                  'rounded-control border px-3 py-2 text-[13px] font-medium transition-colors',
                  propertyCode === p.code ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                )}
              >
                {getPropertyDisplayName(p)}
              </button>
            ))}
          </div>
        </div>

        {propertyCode ? (
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            {t('label_unit_optional')}
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            >
              <option value="">{t('manual_task_site_wide')}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{String(u.name || u.id)}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('label_date')}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('label_title')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('label_description')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none rounded-control border border-line bg-warm-white px-3 py-2 text-[15px] text-ink"
          />
        </label>

        {propertyCode ? (
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            {t('label_assignment_optional')}
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            >
              <option value="">{t('unassigned')}</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{shortStaffName(u.name)}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <Button variant="primary" className="mt-5 w-full" disabled={!canSubmit || submitting} onClick={handleSubmit}>
        {t('save')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={handleClose}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
