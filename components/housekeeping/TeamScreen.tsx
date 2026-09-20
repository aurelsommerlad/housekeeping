'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { UserFormSheet } from './UserFormSheet';

export interface TeamScreenProps {
  app: HousekeepingApp;
}

/** Team-Verwaltung (nur fuer Admins ueber die Navigation erreichbar) - dieselbe saveUser/deleteUser-Logik wie zuvor. */
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
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="font-heading text-lg italic text-ink">{t('team_title')}</h2>
      <Button variant="primary" className="w-full" onClick={openNew}>
        + {t('new_user')}
      </Button>

      {state.users.map((u) => (
        <Card key={u.username}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-ink">{u.name}</span>
            <Badge>{u.role === 'admin' ? t('role_admin') : t('role_housekeeper')}</Badge>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[12.5px] text-muted">
            <span>@{u.username}</span>
            <span>{u.properties === 'alle' || u.properties === 'all' ? t('all_properties') : (Array.isArray(u.properties) ? u.properties.join(', ') : '')}</span>
          </div>
          {u.managedProperties && u.managedProperties.length > 0 ? (
            <p className="mt-1 text-[12.5px] text-status-attention">{t('managed_properties')}: {u.managedProperties.join(', ')}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
              {t('save')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(u.username)}>
              {t('delete')}
            </Button>
          </div>
        </Card>
      ))}

      {formOpen ? <UserFormSheet app={app} user={editing} onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}
