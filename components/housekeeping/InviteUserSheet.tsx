'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { Lang } from '@/lib/housekeeping/i18n';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { isAdmin, isLocationManager, isTeamLeadOf } from '@/lib/housekeeping/permissions';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { HousekeepingTeam, Role } from '@/lib/housekeeping/types';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { IconCopy } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface InviteUserSheetProps {
  app: HousekeepingApp;
  onClose: () => void;
}

const ADMIN_ROLES: Role[] = ['housekeeper', 'location_manager', 'admin'];

/**
 * Briefing "Team-/Benutzerverwaltung ueberarbeiten" - sicheres Einladungssystem: ersetzt die
 * fruehere direkte Kontoerstellung durch einen Admin (der neue Mitarbeiter vergibt sein Passwort
 * selbst auf der Einladungsseite, siehe app/invite/[token]/page.tsx). Diese Datei bildet DREI
 * unterschiedlich weit gefasste Formulare in einer Komponente ab, je nachdem, wer einlaedt:
 *
 * - Admin: volle Auswahl (Rolle, beliebige Standorte/„Alle Standorte", beliebiges Team,
 *   Teamleader-Haken).
 * - Standortverantwortlicher: Rolle fest "housekeeper", Standorte NUR als Teilmenge der eigenen
 *   managedProperties, Team NUR eines, das (auch) an einem eigenen Standort taetig ist, kein
 *   Teamleader-Haken.
 * - Teamleader: Rolle fest "housekeeper", Team FEST auf ein vom Nutzer selbst geleitetes Team
 *   (Auswahl nur bei mehreren eigenen Teams), Standorte NUR als Schnittmenge aus Team-Standorten
 *   und eigener Sichtbarkeit, kein Teamleader-Haken.
 *
 * WICHTIG: das ist ausschliesslich UI-Bequemlichkeit/Vorauswahl - die tatsaechliche, hart
 * durchgesetzte Beschraenkung (niemals Rolle/Team/Standort ausschliesslich anhand von
 * Client-Daten vergeben) liegt vollstaendig in api/invitations.js#resolveInvitationScope. Ein
 * manipulierter Request kann hier bestenfalls etwas anfordern, das der Server ohnehin ablehnt/auf
 * das erlaubte Minimum zurechtstutzt.
 */
export function InviteUserSheet({ app, onClose }: InviteUserSheetProps) {
  const { state, t, createInvitation, showToast } = app;
  const actor = state.user;
  const admin = isAdmin(actor);
  const locationManager = !admin && isLocationManager(actor);
  const ownLeaderTeams: HousekeepingTeam[] = admin || locationManager
    ? []
    : state.teams.filter((tm) => tm.active && isTeamLeadOf(actor, tm.id));

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('housekeeper');
  const [teamId, setTeamId] = useState<string>(ownLeaderTeams[0]?.id || '');
  const [isLeader, setIsLeader] = useState(false);
  const [allProperties, setAllProperties] = useState(admin);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [lang, setLang] = useState<Lang>(actor?.lang || 'de');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const managedProperties = actor?.managedProperties || [];
  const selectedTeam = state.teams.find((tm) => tm.id === teamId) || null;

  // Verfuegbare Standort-Optionen je nach Einladeweg (siehe Kopfkommentar) - der Server prueft
  // dieselbe Schnittmenge unabhaengig davon nochmal selbst.
  const availableProperties = admin
    ? state.properties
    : locationManager
      ? state.properties.filter((p) => managedProperties.includes(p.code))
      : state.properties.filter((p) => {
        const teamProps = selectedTeam?.propertyIds || [];
        if (!teamProps.includes(p.code)) return false;
        if (actor?.properties === 'alle' || actor?.properties === 'all') return true;
        return Array.isArray(actor?.properties) && actor.properties.includes(p.code);
      });

  const invitableTeams = admin
    ? state.teams.filter((tm) => tm.active)
    : locationManager
      ? state.teams.filter((tm) => tm.active && (tm.propertyIds || []).some((p) => managedProperties.includes(p)))
      : ownLeaderTeams;

  function toggleProperty(code: string) {
    setPropertyIds((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleSubmit() {
    if (!email.trim()) return;
    if (!allProperties && availableProperties.length > 0 && propertyIds.length === 0) {
      showToast(t('invite_no_locations_error'));
      return;
    }
    setSubmitting(true);
    const token = await createInvitation({
      email: email.trim(),
      role: admin ? role : 'housekeeper',
      propertyIds: allProperties ? [] : propertyIds,
      teamId: teamId || null,
      isLeader: admin ? isLeader : false,
      lang,
    });
    setSubmitting(false);
    if (token) {
      setInviteLink(`${window.location.origin}/invite/${token}`);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast(t('invite_link_copied_toast'));
    } catch {
      // Clipboard-API kann in seltenen Kontexten fehlen (z. B. kein sicherer Kontext) - der Link
      // steht ohnehin sichtbar im Sheet, ein Fehltoast waere hier nur Rauschen.
    }
  }

  if (inviteLink) {
    return (
      <BottomSheet open onClose={onClose}>
        <h3 className="italic text-lg text-[#17160f]">{t('invite_link_ready_title')}</h3>
        <p className="mt-2 text-sm text-muted">{t('invite_link_hint')}</p>
        <div className="mt-4 flex items-center gap-2 rounded-control border border-line bg-warm-white px-3 py-2.5">
          <span className="flex-1 truncate text-sm text-ink">{inviteLink}</span>
          <button type="button" onClick={copyLink} className="shrink-0 text-muted transition-colors hover:text-ink" aria-label={t('invite_link_copy_action')}>
            <IconCopy width={18} height={18} />
          </button>
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={copyLink}>
          {t('invite_link_copy_action')}
        </Button>
        <Button variant="primary" className="mt-2 w-full" onClick={onClose}>
          {t('close')}
        </Button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">{t('invite_title')}</h3>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
          />
        </label>

        {admin ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            {t('role')}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink"
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === 'admin' ? t('role_admin') : r === 'location_manager' ? t('role_location_manager') : t('role_housekeeper')}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[13px] text-muted">{t('role')}: {t('role_housekeeper')}</p>
        )}

        {invitableTeams.length > 0 ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            {t('team_label')}
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              disabled={!admin && !locationManager && ownLeaderTeams.length <= 1}
              className="h-11 rounded-control border border-line bg-warm-white px-3 text-[15px] text-ink disabled:bg-surface"
            >
              {(admin || locationManager) ? <option value="">{t('no_team_label')}</option> : null}
              {invitableTeams.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {admin && teamId ? (
          <button
            type="button"
            onClick={() => setIsLeader((v) => !v)}
            className={cn(
              'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
              isLeader ? 'border-status-attention bg-status-attention-bg text-status-attention' : 'border-line bg-warm-white text-muted',
            )}
          >
            {t('invite_is_leader_label')}
          </button>
        ) : null}

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('team_col_locations')}
          {admin ? (
            <button
              type="button"
              onClick={() => setAllProperties((v) => !v)}
              className={cn(
                'rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                allProperties ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink',
              )}
            >
              {t('all_properties')}
            </button>
          ) : null}
          {!allProperties ? (
            availableProperties.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availableProperties.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => toggleProperty(p.code)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      propertyIds.includes(p.code) ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                    )}
                  >
                    {getPropertyDisplayName(p)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">{t('team_no_results')}</p>
            )
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          {t('language_label')}
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'flex-1 rounded-control border px-3 py-2 text-[13px] font-semibold uppercase transition-colors',
                  lang === l ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button variant="primary" className="mt-5 w-full" onClick={handleSubmit} disabled={submitting || !email.trim()}>
        {t('invite_submit_action')}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
        {t('cancel')}
      </Button>
    </BottomSheet>
  );
}
