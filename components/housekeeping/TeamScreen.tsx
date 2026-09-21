'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { Button } from '@/components/ui/Button';
import { AdminBadge, AdminSection } from './admin';
import { UserFormSheet } from './UserFormSheet';

export interface TeamScreenProps {
  app: HousekeepingApp;
}

/** Mitarbeiterverwaltung (nur fuer Admins ueber die Navigation erreichbar, sowohl direkt ueber
 * den Bottom-Nav-Tab "Team" als auch ueber Einstellungen > Teams & Benutzer > "Mitarbeiter") -
 * dieselbe saveUser/deleteUser-Logik wie zuvor, nur im Owner-Center-Layout (siehe
 * components/housekeeping/admin/). Bewusst OHNE eigenen Zurueck-Link/AdminPage-Rahmen: dieser
 * Screen ist ein primaerer Bottom-Nav-Tab wie "Aufgaben"/"Apartments", kein Settings-Unterpunkt. */
export function TeamScreen({ app }: TeamScreenProps) {
  const { state, t, deleteUser } = app;
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(u: StaffUser) {
    setEditing(u);
    setFormOpen(true);
  }
  async function handleDelete(username: string) {
    if (typeof window !== 'undefined' && !window.confirm(t('delete_confirm'))) return;
    await deleteUser(username);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t('team_title')}</h1>
        <Button variant="secondary" size="sm" onClick={openNew}>+ {t('new_user')}</Button>
      </div>

      <div className="flex flex-col gap-3">
        {state.users.map((u) => (
          <AdminSection
            key={u.username}
            title={u.name}
            description={`@${u.username}`}
            actions={<AdminBadge label={u.role === 'admin' ? t('role_admin') : t('role_housekeeper')} tone={u.role === 'admin' ? 'strong' : 'neutral'} />}
          >
            <p className="text-xs text-muted">
              {u.properties === 'alle' || u.properties === 'all' ? t('all_properties') : (Array.isArray(u.properties) ? u.properties.join(', ') : '')}
            </p>
            {u.managedProperties && u.managedProperties.length > 0 ? (
              <p className="mt-1 text-xs text-status-attention">{t('managed_properties')}: {u.managedProperties.join(', ')}</p>
            ) : null}
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>{t('save')}</Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(u.username)}>{t('delete')}</Button>
            </div>
          </AdminSection>
        ))}
      </div>

      {formOpen ? <UserFormSheet app={app} user={editing} onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}
