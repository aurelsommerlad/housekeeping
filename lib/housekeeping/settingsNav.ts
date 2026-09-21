/**
 * Zentrale Navigations-Konfiguration fuer den Admin-/Einstellungsbereich (Informationsarchitektur-
 * Ueberarbeitung). EINZIGE Quelle fuer Titel/Beschreibung/Icon/Berechtigung der Kategorien und
 * ihrer festen Unterpunkte - SettingsScreen.tsx rendert daraus, statt jede Zeile einzeln
 * hartzucodieren. Das macht Navigation und Berechtigungs-Sichtbarkeit konsistent und bereitet eine
 * spaetere "Einstellungen durchsuchen"-Suche vor (Punkt 9), ohne sie hier schon zu bauen.
 *
 * WICHTIG (Punkt 10): `requiredRole` steuert ausschliesslich, ob eine Zeile IN DER NAVIGATION
 * angezeigt wird. Das ersetzt nie eine serverseitige Pruefung - jede echte Aktion bleibt ueber die
 * jeweilige API-Route abgesichert (siehe api/*.js). Ein Team Lead bekommt durch `adminOrLead`
 * niemals globale Adminrechte, sondern nur Sicht auf Zeilen, die ihre eigene Bildschirm-Logik
 * (z. B. HousekeepingTeamsScreen) ohnehin schon auf sein eigenes Team beschraenkt.
 *
 * Dynamische Eintraege (die Property-Liste selbst unter "Standorte & Apartments") sind bewusst
 * NICHT hier modelliert - sie werden zur Laufzeit aus state.properties erzeugt, `PROPERTY_DETAIL_LEAVES`
 * beschreibt aber die je Property immer gleichen, festen Unterpunkte.
 */
import type { ComponentType, SVGProps } from 'react';
import { IconAlertCircle, IconBook, IconBuilding, IconGear, IconPlug, IconUsers } from '@/components/ui/icons';
import type { I18nKey } from './i18n';

export type SettingsCategoryId = 'housekeeping' | 'properties' | 'team' | 'reports' | 'integrations' | 'system';

/** 'admin' = nur UNIQUE-PLACES-Admins, 'adminOrLead' = zusaetzlich Reinigungsfirmen-Verantwortliche
 * (teamRole: 'lead') - siehe lib/housekeeping/permissions.ts#isTeamLead. Keine weitere Rollenstufe. */
export type SettingsRequiredRole = 'admin' | 'adminOrLead';

export interface SettingsRoleContext {
  admin: boolean;
  lead: boolean;
}

export function canSeeSettingsEntry(role: SettingsRequiredRole, ctx: SettingsRoleContext): boolean {
  if (role === 'admin') return ctx.admin;
  return ctx.admin || ctx.lead;
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface SettingsCategoryDef {
  id: SettingsCategoryId;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
  icon: IconComponent;
  requiredRole: SettingsRequiredRole;
}

/** Die 6 Kategorien der neuen Einstellungsstartseite, in Anzeigereihenfolge (3 Gruppen zu je 2). */
export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  { id: 'housekeeping', titleKey: 'settings_cat_housekeeping_title', descriptionKey: 'settings_cat_housekeeping_desc', icon: IconBook, requiredRole: 'admin' },
  { id: 'properties', titleKey: 'settings_cat_properties_title', descriptionKey: 'settings_cat_properties_desc', icon: IconBuilding, requiredRole: 'admin' },
  { id: 'team', titleKey: 'settings_cat_team_title', descriptionKey: 'settings_cat_team_desc', icon: IconUsers, requiredRole: 'adminOrLead' },
  { id: 'reports', titleKey: 'settings_cat_reports_title', descriptionKey: 'settings_cat_reports_desc', icon: IconAlertCircle, requiredRole: 'admin' },
  { id: 'integrations', titleKey: 'settings_cat_integrations_title', descriptionKey: 'settings_cat_integrations_desc', icon: IconPlug, requiredRole: 'admin' },
  { id: 'system', titleKey: 'settings_cat_system_title', descriptionKey: 'settings_cat_system_desc', icon: IconGear, requiredRole: 'admin' },
];

export const SETTINGS_CATEGORY_GROUPS: { labelKey: I18nKey; categories: SettingsCategoryId[] }[] = [
  { labelKey: 'settings_group_housekeeping', categories: ['housekeeping', 'properties'] },
  { labelKey: 'settings_group_organisation', categories: ['team', 'reports'] },
  { labelKey: 'settings_group_system', categories: ['integrations', 'system'] },
];

/** Feste (nicht property-gebundene) Unterpunkte je Kategorie. Reihenfolge = Anzeigereihenfolge. */
export type SettingsLeafId =
  | 'housekeeping-rules' | 'housekeeping-times' | 'housekeeping-linen'
  | 'team-members' | 'team-companies' | 'team-permissions' | 'team-property-access'
  | 'reports-incidents' | 'reports-consumables'
  | 'system-language';

export interface SettingsLeafDef {
  id: SettingsLeafId;
  category: SettingsCategoryId;
  titleKey: I18nKey;
  requiredRole: SettingsRequiredRole;
}

export const SETTINGS_LEAVES: SettingsLeafDef[] = [
  { id: 'housekeeping-rules', category: 'housekeeping', titleKey: 'nav_rules', requiredRole: 'admin' },
  { id: 'housekeeping-times', category: 'housekeeping', titleKey: 'standard_times_title', requiredRole: 'admin' },
  { id: 'housekeeping-linen', category: 'housekeeping', titleKey: 'linen_settings_title', requiredRole: 'admin' },

  { id: 'team-members', category: 'team', titleKey: 'settings_members_row', requiredRole: 'admin' },
  { id: 'team-companies', category: 'team', titleKey: 'housekeeping_teams_row', requiredRole: 'adminOrLead' },
  { id: 'team-permissions', category: 'team', titleKey: 'settings_permissions_row', requiredRole: 'admin' },
  { id: 'team-property-access', category: 'team', titleKey: 'settings_property_access_row', requiredRole: 'admin' },

  { id: 'reports-incidents', category: 'reports', titleKey: 'settings_incidents_row', requiredRole: 'admin' },
  { id: 'reports-consumables', category: 'reports', titleKey: 'settings_consumable_reports_row', requiredRole: 'admin' },

  { id: 'system-language', category: 'system', titleKey: 'language_label', requiredRole: 'admin' },
];

export function leavesForCategory(category: SettingsCategoryId): SettingsLeafDef[] {
  return SETTINGS_LEAVES.filter((leaf) => leaf.category === category);
}

/** Feste Unterpunkte je einzelnem Property unter "Standorte & Apartments" (Punkt 2) - Reihenfolge
 * = Anzeigereihenfolge. Kein eigenstaendiger "Housekeeping"-Punkt (siehe Analysebericht): dessen
 * einzige heute existierende Inhalte sind bereits genau diese vier Zeilen. */
export type PropertyLeafId = 'apartments' | 'linen' | 'consumables' | 'team' | 'nfc';

export interface PropertyLeafDef {
  id: PropertyLeafId;
  titleKey: I18nKey;
  requiredRole: SettingsRequiredRole;
}

export const PROPERTY_DETAIL_LEAVES: PropertyLeafDef[] = [
  { id: 'apartments', titleKey: 'nav_apartments', requiredRole: 'admin' },
  { id: 'linen', titleKey: 'linen_settings_title', requiredRole: 'admin' },
  { id: 'consumables', titleKey: 'consumable_settings_title', requiredRole: 'admin' },
  { id: 'team', titleKey: 'settings_property_team_row', requiredRole: 'adminOrLead' },
  { id: 'nfc', titleKey: 'nfc_settings_title', requiredRole: 'admin' },
];
