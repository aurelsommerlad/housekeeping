'use client';

/**
 * Session-Client fuer den Housekeeping-Bereich - nutzt die bereits vorhandenen, getesteten
 * Next-nativen Routen app/api/auth/{me,login,logout}/route.ts (ohne `scope`, funktioniert fuer
 * jede Rolle) statt eigene Auth-Logik zu erfinden. Dieselbe HttpOnly-Cookie-Session wie im
 * Adminbereich - ein Login hier oder unter /admin ist gegenseitig kompatibel.
 */
import type { StaffUser } from './types';

export interface MeResponse {
  authenticated: boolean;
  user: StaffUser | null;
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fehler ${res.status}`);
  return res.json();
}

export async function login(identifier: string, password: string): Promise<StaffUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Anmeldung fehlgeschlagen.');
  return data.user as StaffUser;
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignorieren - der Client setzt den lokalen Zustand ohnehin zurueck.
  }
}
