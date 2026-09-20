'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { FilterBar } from './FilterBar';
import { RoomCard } from './RoomCard';
import { MultiSelectBar } from './MultiSelectBar';
import { BulkAssignSheet } from './BulkAssignSheet';
import { Button } from '@/components/ui/Button';

/**
 * Zimmeruebersicht - Toolbar (Meine Zimmer / Mehrfachauswahl / Alle Zuweisungen aufheben fuer
 * Admins), Statusfilter und das Grid der reduzierten Room Cards. Dieselbe Sichtbarkeitslogik
 * wie zuvor in app.js#visibleRooms.
 */
export function RoomsScreen({ app }: { app: HousekeepingApp }) {
  const { state, t, rooms, toggleMyRooms, toggleMultiSelect, setFilter, openRoom, bulkAssign, clearAllAssignments, retryLoad } = app;
  const [bulkOpen, setBulkOpen] = useState(false);
  const isAdmin = state.user?.role === 'admin';

  let visible = rooms();
  if (!isAdmin && state.myRoomsOnly) {
    visible = visible.filter((r) => r.assignment && r.assignment.housekeeperId === state.user?.id);
  }
  switch (state.filter) {
    case 'forced': visible = visible.filter((r) => r.forced); break;
    case 'dirty': visible = visible.filter((r) => r.condition === 'Dirty'); break;
    case 'inspect': visible = visible.filter((r) => r.condition === 'CleanToBeInspected'); break;
    case 'clean': visible = visible.filter((r) => r.condition === 'Clean'); break;
    case 'doubleup': visible = visible.filter((r) => r.doubleup?.types?.length); break;
  }

  const propHks: StaffUser[] = state.users.filter(
    (u) => u.role !== 'admin' &&
      (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && state.activeProperty !== null && u.properties.includes(state.activeProperty))),
  );

  async function handleClearAll() {
    if (typeof window !== 'undefined' && !window.confirm(t('clear_all_confirm'))) return;
    await clearAllAssignments();
  }

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {!isAdmin ? (
          <Button variant="secondary" size="sm" onClick={toggleMyRooms}>
            {state.myRoomsOnly ? t('all_rooms') : t('my_rooms')}
          </Button>
        ) : null}
        {isAdmin ? (
          <>
            <Button variant={state.multiSelect ? 'primary' : 'secondary'} size="sm" onClick={toggleMultiSelect}>
              {state.multiSelect ? t('multiselect_on') : t('multiselect')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              {t('clear_all')}
            </Button>
          </>
        ) : null}
      </div>

      <FilterBar lang={state.lang} active={state.filter} onChange={setFilter} />

      {state.loading && visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('loading')}</div>
      ) : state.roomsLoadError ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-status-attention">{state.roomsLoadError}</p>
          <Button className="mt-4" size="sm" onClick={() => retryLoad()}>
            {t('retry')}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('no_rooms')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-1 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((r) => (
            <RoomCard
              key={r.key}
              room={r}
              lang={state.lang}
              selected={state.selectedRooms.has(r.key)}
              selectable={state.multiSelect}
              onOpen={() => openRoom(r.key)}
            />
          ))}
        </div>
      )}

      {state.multiSelect ? (
        <MultiSelectBar
          lang={state.lang}
          count={state.selectedRooms.size}
          onAssign={() => setBulkOpen(true)}
          onCancel={toggleMultiSelect}
        />
      ) : null}

      <BulkAssignSheet
        open={bulkOpen}
        lang={state.lang}
        housekeepers={propHks}
        count={state.selectedRooms.size}
        onClose={() => setBulkOpen(false)}
        onPick={(hk) => {
          bulkAssign(Array.from(state.selectedRooms), { id: hk.id, name: hk.name });
          setBulkOpen(false);
        }}
      />
    </div>
  );
}
