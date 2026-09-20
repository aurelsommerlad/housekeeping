'use client';

import { useEffect, useState } from 'react';
import { getPropertyDisplayName, searchReservations } from '@/lib/housekeeping/api';
import type { ReservationSearchResult } from '@/lib/housekeeping/types';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';

export interface ReservationSearchSheetProps {
  app: HousekeepingApp;
  open: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

function formatDayMonthYear(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Admin-Reservierungssuche (Punkt 5-7) - EIN dezentes Suchsymbol im Header oeffnet dieses Sheet,
 * statt dauerhaft ein grosses Suchfeld ueber der Planung zu zeigen (Punkt 6). Sucht per Debounce
 * live gegen Apaleo (Punkt 8, api/reservation-search.js) - nicht nur die vier geladenen
 * Planungstage. Ein Treffer mit bereits geladenem Housekeeping-Task oeffnet diesen direkt, sonst
 * werden trotzdem die Reservierungsinformationen gezeigt (Punkt 7).
 */
export function ReservationSearchSheet({ app, open, onClose }: ReservationSearchSheetProps) {
  const { state, t, showToast, selectDay, setActiveNav, openTask, tasksForDayAll, toggleMyTasksOnly } = app;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReservationSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmedQuery = query.trim();
  const queryTooShort = trimmedQuery.length < MIN_QUERY_LENGTH;

  // Setzt State nur innerhalb des setTimeout-Callbacks (Reaktion auf den abgelaufenen Debounce-
  // Timer, ein externes Ereignis) statt synchron im Effekt-Koerper selbst - fuer "zu kurz" wird
  // gar kein setState gebraucht, das Rendering blendet veraltete `results` ueber `queryTooShort`
  // aus (siehe unten), statt sie per Effekt aktiv zu loeschen.
  useEffect(() => {
    if (!open || queryTooShort) return;
    const handle = setTimeout(() => {
      setLoading(true);
      searchReservations(trimmedQuery)
        .then((r) => setResults(r))
        .catch((err) => {
          showToast(err instanceof Error ? err.message : String(err));
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, open, queryTooShort]);

  function handleClose() {
    setQuery('');
    setResults(null);
    onClose();
  }

  // Punkt 4/7: ein Treffer ist nur dann "verknuepft", wenn sein Abreisedatum einer der aktuell
  // geladenen Planungstage ist UND darunter tatsaechlich ein Task existiert, der GENAU diese
  // Reservierung als Abreise- oder Folgereservierung fuehrt (praezise Zuordnung ueber die IDs,
  // nicht nur ueber Property+Unit+Datum geraten).
  function findAssociatedTask(r: ReservationSearchResult) {
    if (!state.planningDays.includes(r.departureDate)) return null;
    return tasksForDayAll(r.departureDate).find(
      (task) => task.sourceReservationId === r.reservationId || task.nextReservationId === r.reservationId,
    ) || null;
  }

  function handleOpenTask(r: ReservationSearchResult) {
    const task = findAssociatedTask(r);
    if (!task) return;
    // "Meine Aufgaben"-Filter wuerde den Treffer sonst aus `visible` herausfiltern, falls er
    // nicht dem suchenden Admin selbst zugewiesen ist.
    if (state.myTasksOnly) toggleMyTasksOnly();
    // React batcht diese State-Updates in einem Render, TasksScreen berechnet `visible` (und
    // damit den Lookup fuer detailTaskId) also bereits mit dem neuen selectedDay.
    selectDay(task.date);
    setActiveNav('tasks');
    openTask(task.id);
    handleClose();
  }

  const visibleResults = queryTooShort ? null : results;

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('search_title')}</h3>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search_placeholder')}
        autoFocus
        className="mt-3 w-full rounded-control border border-line bg-warm-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted"
      />

      <div className="mt-3 flex flex-col gap-2">
        {!queryTooShort && loading ? (
          <p className="py-6 text-center text-[13px] text-muted">{t('loading')}</p>
        ) : visibleResults === null ? null : visibleResults.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">{t('search_no_results')}</p>
        ) : (
          visibleResults.map((r) => {
            const task = findAssociatedTask(r);
            const propertyLabel = getPropertyDisplayName({ code: r.propertyCode, name: r.propertyName });
            const body = (
              <>
                <p className="font-medium text-ink">{r.guestName || '–'}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{r.reservationId} · {r.unitName} · {propertyLabel}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {formatDayMonthYear(r.arrivalDate)}–{formatDayMonthYear(r.departureDate)} · {t('search_adults_count', { n: r.adults ?? 0 })}
                </p>
                {task ? (
                  <p className="mt-2 text-[12.5px] font-medium text-ink">{t('search_task_ref', { date: formatDayMonthYear(task.date) })}</p>
                ) : (
                  <p className="mt-2 text-[12.5px] text-muted">{t('search_no_task')}</p>
                )}
              </>
            );
            return task ? (
              <button
                key={r.reservationId}
                type="button"
                onClick={() => handleOpenTask(r)}
                className="rounded-control border border-line bg-warm-white p-3.5 text-left transition-colors hover:border-sage/50"
              >
                {body}
              </button>
            ) : (
              <div key={r.reservationId} className="rounded-control border border-line bg-warm-white p-3.5 text-left">
                {body}
              </div>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}
