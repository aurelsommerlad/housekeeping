'use client';

import { useState } from 'react';
import { APP_VERSION } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isAdmin, isElevatedHousekeepingUser, isTeamLead } from '@/lib/housekeeping/permissions';
import { RulesScreen } from './RulesScreen';
import { NfcSettingsScreen } from './NfcSettingsScreen';
import { StandardTimesScreen } from './StandardTimesScreen';
import { LanguagePicker } from './LanguagePicker';
import { HousekeepingTeamsScreen } from './HousekeepingTeamsScreen';
import { ItemCatalogSettingsScreen } from './ItemCatalogSettingsScreen';
import { Card } from '@/components/ui/Card';
import { IconChevronDown } from '@/components/ui/icons';

export interface SettingsScreenProps {
  app: HousekeepingApp;
}

type SettingsView = 'root' | 'rules' | 'times' | 'nfc' | 'language' | 'teams' | 'linen' | 'consumables';

interface SettingsRowProps {
  label: string;
  value?: string;
  onClick?: () => void;
}

function SettingsRow({ label, value, onClick }: SettingsRowProps) {
  return (
    <Card onClick={onClick} className="flex items-center justify-between p-4">
      <p className="text-ink">{label}</p>
      <div className="flex items-center gap-2 text-muted">
        {value ? <span className="text-[13px]">{value}</span> : null}
        {onClick ? <IconChevronDown width={16} height={16} className="-rotate-90 shrink-0" /> : null}
      </div>
    </Card>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-muted">{children}</p>;
}

interface BackBarProps {
  label: string;
  onBack: () => void;
}

function BackBar({ label, onBack }: BackBarProps) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1 px-4 pt-4 text-[13px] font-medium text-muted transition-colors hover:text-ink"
    >
      <IconChevronDown width={14} height={14} className="rotate-90" />
      {label}
    </button>
  );
}

/**
 * Zentrale Einstellungsseite (Briefing: "Wir haben bewusst entschieden, kein separates
 * Admin-Backend fuer den laufenden Betrieb zu haben. Administrative Funktionen muessen deshalb
 * innerhalb der normalen Housekeeping-App erreichbar sein."). Nur ueber das Profilmenue
 * (SettingsSheet -> "Einstellungen") erreichbar, als activeNav-Screen innerhalb derselben App -
 * kein eigenes /admin-UI, keine Duplikate von Team/Regeln (RulesScreen/TeamScreen/
 * NfcSettingsScreen/StandardTimesScreen bleiben die jeweils einzige Implementierung, hier nur
 * eingebettet bzw. verlinkt). Die eigentliche Absicherung bleibt serverseitig je Endpunkt
 * (api/users.js, api/nfc-tags.js, ...) - der isAdmin-Check in app/page.tsx ist reine Client-UX.
 */
export function SettingsScreen({ app }: SettingsScreenProps) {
  const { state, t, setActiveNav } = app;
  const [view, setView] = useState<SettingsView>('root');

  if (view === 'rules') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <RulesScreen app={app} />
      </div>
    );
  }

  if (view === 'times') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <StandardTimesScreen app={app} />
      </div>
    );
  }

  if (view === 'nfc') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <div className="px-4 py-4">
          <NfcSettingsScreen app={app} />
        </div>
      </div>
    );
  }

  if (view === 'teams') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <HousekeepingTeamsScreen app={app} />
      </div>
    );
  }

  if (view === 'linen') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <ItemCatalogSettingsScreen app={app} kind="linen" />
      </div>
    );
  }

  if (view === 'consumables') {
    return (
      <div className="flex flex-col gap-1">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <ItemCatalogSettingsScreen app={app} kind="consumable" />
      </div>
    );
  }

  if (view === 'language') {
    return (
      <div className="flex flex-col gap-4">
        <BackBar label={t('settings_back')} onBack={() => setView('root')} />
        <div className="flex flex-col gap-1.5 px-4">
          <h2 className="italic text-lg text-[#17160f]">{t('language_label')}</h2>
          <LanguagePicker app={app} />
        </div>
      </div>
    );
  }

  const admin = isAdmin(state.user);
  const lead = isTeamLead(state.user);
  const elevated = isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code));

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('settings_title')}</h2>

      {/* Regeln/Standardzeiten/NFC bleiben admin-only (unveraendertes bestehendes Verhalten) -
       * ein Team Lead erreicht diesen Screen jetzt zwar ueberhaupt (Bugfix), bekommt hier aber
       * ausschliesslich die fuer ihn vorgesehenen Abschnitte weiter unten zu sehen. */}
      {admin ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('settings_section_housekeeping')}</SectionLabel>
          <SettingsRow label={t('nav_rules')} onClick={() => setView('rules')} />
          <SettingsRow label={t('standard_times_title')} onClick={() => setView('times')} />
          <SettingsRow label={t('linen_settings_title')} onClick={() => setView('linen')} />
          <SettingsRow label={t('consumable_settings_title')} onClick={() => setView('consumables')} />
        </div>
      ) : null}

      {admin ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('settings_section_apartments')}</SectionLabel>
          <SettingsRow label={t('nfc_settings_title')} onClick={() => setView('nfc')} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('settings_section_management')}</SectionLabel>
        {admin ? <SettingsRow label={t('settings_team_row')} onClick={() => setActiveNav('team')} /> : null}
        {admin || lead ? (
          <SettingsRow label={t('housekeeping_teams_row')} onClick={() => setView('teams')} />
        ) : null}
        {/* Fuer "elevated" Benutzer (Admin/Standortverantwortlich/Lead) ist "Vorfall melden"
         * bewusst KEIN eigener Bottom-Nav-Punkt (siehe StaffNavBar.tsx - sonst 5 gleichwertige
         * Punkte, dieselbe Bedingung wie dort) - hier ohne Vorauswahl erreichbar, bevorzugter Weg
         * bleibt aber die sekundaere Aktion direkt in der Task-Detailansicht. */}
        {elevated ? (
          <SettingsRow label={t('report_incident_title')} onClick={() => app.openIncidentReport()} />
        ) : null}
        {elevated ? (
          <SettingsRow label={t('report_consumable_title')} onClick={() => app.openConsumableReport()} />
        ) : null}
      </div>

      {admin ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('settings_section_app')}</SectionLabel>
          <SettingsRow label={t('language_label')} value={state.lang.toUpperCase()} onClick={() => setView('language')} />
          <SettingsRow label={t('version_label')} value={`v${APP_VERSION}`} />
        </div>
      ) : null}
    </div>
  );
}
