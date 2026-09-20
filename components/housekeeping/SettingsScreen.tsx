'use client';

import { useState } from 'react';
import { APP_VERSION } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { RulesScreen } from './RulesScreen';
import { NfcSettingsScreen } from './NfcSettingsScreen';
import { StandardTimesScreen } from './StandardTimesScreen';
import { LanguagePicker } from './LanguagePicker';
import { Card } from '@/components/ui/Card';
import { IconChevronDown } from '@/components/ui/icons';

export interface SettingsScreenProps {
  app: HousekeepingApp;
}

type SettingsView = 'root' | 'rules' | 'times' | 'nfc' | 'language';

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

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('settings_title')}</h2>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('settings_section_housekeeping')}</SectionLabel>
        <SettingsRow label={t('nav_rules')} onClick={() => setView('rules')} />
        <SettingsRow label={t('standard_times_title')} onClick={() => setView('times')} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('settings_section_apartments')}</SectionLabel>
        <SettingsRow label={t('nfc_settings_title')} onClick={() => setView('nfc')} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('settings_section_management')}</SectionLabel>
        <SettingsRow label={t('settings_team_row')} onClick={() => setActiveNav('team')} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t('settings_section_app')}</SectionLabel>
        <SettingsRow label={t('language_label')} value={state.lang.toUpperCase()} onClick={() => setView('language')} />
        <SettingsRow label={t('version_label')} value={`v${APP_VERSION}`} />
      </div>
    </div>
  );
}
