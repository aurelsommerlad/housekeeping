'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';

export interface UserFormSheetProps {
  app: HousekeepingApp;
  user: StaffUser | null;
  onClose: () => void;
}

/**
 * Ersetzt die frueheren `prompt()`-Dialoge des Team-Screens durch ein hochwertiges Formular im
 * Bottom Sheet - ruft dieselbe `saveUser`-Aktion (api/users.js#set) mit denselben Feldern auf.
 *
 * Wird vom Team-Screen nur bei geoeffnetem Formular ueberhaupt gemountet (statt dauerhaft mit
 * einem `open`-Flag) - so liest jeder Feld-State per Lazy-Initializer direkt aus `user`, ohne
 * einen synchronisierenden Effekt zu brauchen.
 */
export function UserFormSheet({ app, user, onClose }: UserFormSheetProps) {
  const { state, t, saveUser } = app;
  const [username, setUsername] = useState(user?.username || '');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<'admin' | 'housekeeping'>(user?.role === 'admin' ? 'admin' : 'housekeeping');
  const isAllInitially = !user || user.properties === 'alle' || user.properties === 'all';
  const [allProperties, setAllProperties] = useState(isAllInitially);
  const [properties, setProperties] = useState<string[]>(isAllInitially ? [] : (user!.properties as string[]));
  const [password, setPassword] = useState('');

  function toggleProperty(code: string) {
    setProperties((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleSubmit() {
    if (!username.trim()) return;
    await saveUser({
      username: username.trim(),
      name: name.trim() || username.trim(),
      email: email.trim(),
      role,
      properties: allProperties ? 'alle' : properties,
      ...(password ? { password } : {}),
    });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose}>
      <h3 className="font-heading text-lg italic text-ink">{user ? name || username : t('new_user')}</h3>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('username')}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!user}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink disabled:bg-surface disabled:text-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('role')}
          <div className="flex gap-2">
            {(['housekeeping', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={
                  'flex-1 rounded-control border px-3 py-2.5 text-[13px] font-medium transition-colors ' +
                  (role === r ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted')
                }
              >
                {r === 'admin' ? t('role_admin') : t('role_housekeeper')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('properties')}
          <button
            type="button"
            onClick={() => setAllProperties((v) => !v)}
            className={
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ' +
              (allProperties ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink')
            }
          >
            {t('all_properties')}
          </button>
          {!allProperties ? (
            <div className="flex flex-wrap gap-2">
              {state.properties.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => toggleProperty(p.code)}
                  className={
                    'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
                    (properties.includes(p.code) ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted')
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('password')} {user ? '(leer lassen = unveraendert)' : ''}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>
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
