'use client';

import { useState, type ReactNode } from 'react';
import { APP_VERSION, getPropertyDisplayName } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import {
  PROPERTY_DETAIL_LEAVES, SETTINGS_CATEGORIES, SETTINGS_CATEGORY_GROUPS, SETTINGS_LEAVES, canSeeSettingsEntry,
  leavesForCategory, type PropertyLeafId, type SettingsCategoryId, type SettingsLeafId,
} from '@/lib/housekeeping/settingsNav';
import { RulesScreen } from './RulesScreen';
import { NfcSettingsScreen } from './NfcSettingsScreen';
import { StandardTimesScreen } from './StandardTimesScreen';
import { LanguagePicker } from './LanguagePicker';
import { HousekeepingTeamsScreen } from './HousekeepingTeamsScreen';
import { ItemCatalogSettingsScreen } from './ItemCatalogSettingsScreen';
import { PermissionsOverviewScreen } from './PermissionsOverviewScreen';
import { PropertyAccessOverviewScreen } from './PropertyAccessOverviewScreen';
import { IncidentsOverviewScreen } from './IncidentsOverviewScreen';
import { ConsumableReportsOverviewScreen } from './ConsumableReportsOverviewScreen';
import { IntegrationsScreen } from './IntegrationsScreen';
import { Card } from '@/components/ui/Card';
import { IconChevronDown } from '@/components/ui/icons';

export interface SettingsScreenProps {
  app: HousekeepingApp;
}

/** Navigations-"Route" innerhalb der Einstellungen - EIN kleiner Stack statt eines flachen
 * Enum-Views (Punkt 8 "jederzeit klar, wo sich der Admin befindet"), da die Struktur jetzt bis zu
 * 4 Ebenen tief ist (Einstellungen > Standorte & Apartments > <Property> > Wäsche & Bettsachen). */
type SettingsRoute =
  | { screen: 'root' }
  | { screen: 'category'; category: SettingsCategoryId }
  | { screen: 'leaf'; leaf: SettingsLeafId }
  | { screen: 'property'; code: string }
  | { screen: 'property-leaf'; code: string; leaf: PropertyLeafId };

interface Crumb {
  label: string;
  onClick?: () => void;
}

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

/** Kopfbereich einer Unterseite (Punkt 8): Desktop zeigt die volle Breadcrumb-Kette klickbar,
 * Mobile bewusst NUR "Zurück" + aktueller Seitentitel (keine erzwungene lange Breadcrumb-Zeile). */
function SettingsHeader({ crumbs, backLabel }: { crumbs: Crumb[]; backLabel: string }) {
  const current = crumbs[crumbs.length - 1];
  const previous = crumbs[crumbs.length - 2];
  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      <nav className="hidden flex-wrap items-center gap-1.5 text-[12.5px] text-muted sm:flex" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            {crumb.onClick ? (
              <button type="button" onClick={crumb.onClick} className="transition-colors hover:text-ink">
                {crumb.label}
              </button>
            ) : (
              <span className="font-medium text-ink">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      {previous ? (
        <button
          type="button"
          onClick={previous.onClick}
          className="flex w-fit items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-ink sm:hidden"
        >
          <IconChevronDown width={14} height={14} className="rotate-90" />
          {backLabel}
        </button>
      ) : null}
      <h2 className="italic text-lg text-[#17160f]">{current.label}</h2>
    </div>
  );
}

/**
 * Zentrale Einstellungsseite (Briefing: "Wir haben bewusst entschieden, kein separates
 * Admin-Backend fuer den laufenden Betrieb zu haben. Administrative Funktionen muessen deshalb
 * innerhalb der normalen Housekeeping-App erreichbar sein."). Nur ueber das Profilmenue
 * (SettingsSheet -> "Einstellungen") erreichbar, als activeNav-Screen innerhalb derselben App.
 *
 * INFORMATIONSARCHITEKTUR-UEBERARBEITUNG: Die Startseite zeigt jetzt nur noch 6 uebergeordnete
 * Kategorien (lib/housekeeping/settingsNav.ts ist die einzige Quelle fuer deren Titel/Beschreibung/
 * Icon/Berechtigung), statt eine mit jeder neuen Funktion laenger werdende flache Liste. Bestehende
 * Bildschirme (RulesScreen/StandardTimesScreen/NfcSettingsScreen/HousekeepingTeamsScreen/
 * ItemCatalogSettingsScreen) bleiben UNVERAENDERT die jeweils einzige Implementierung, hier nur an
 * neuer Stelle eingehaengt bzw. (Standorte & Apartments) mit einem propertyFilter wiederverwendet.
 * Die serverseitige role/property-Pruefung je API-Route bleibt die eigentliche Absicherung - diese
 * Navigation ist reine Client-UX (Punkt 10).
 */
export function SettingsScreen({ app }: SettingsScreenProps) {
  const { state, t, setActiveNav, selectProperty } = app;
  const [route, setRoute] = useState<SettingsRoute>({ screen: 'root' });

  const admin = isAdmin(state.user);
  const lead = isTeamLead(state.user);
  const roleCtx = { admin, lead };

  const visibleCategories = SETTINGS_CATEGORIES.filter((c) => canSeeSettingsEntry(c.requiredRole, roleCtx));
  const visibleCategoryIds = new Set(visibleCategories.map((c) => c.id));

  function categoryTitle(id: SettingsCategoryId): string {
    const def = SETTINGS_CATEGORIES.find((c) => c.id === id);
    return def ? t(def.titleKey) : id;
  }
  function leafTitle(id: SettingsLeafId): string {
    const def = SETTINGS_LEAVES.find((l) => l.id === id);
    return def ? t(def.titleKey) : id;
  }
  function propertyLeafTitle(id: PropertyLeafId): string {
    const def = PROPERTY_DETAIL_LEAVES.find((l) => l.id === id);
    return def ? t(def.titleKey) : id;
  }
  function propertyTitle(code: string): string {
    const prop = state.properties.find((p) => p.code === code);
    return prop ? getPropertyDisplayName(prop) : code;
  }

  function crumbsFor(r: SettingsRoute): Crumb[] {
    const root: Crumb = { label: t('settings_title'), onClick: r.screen !== 'root' ? () => setRoute({ screen: 'root' }) : undefined };
    if (r.screen === 'root') return [root];
    if (r.screen === 'category') return [root, { label: categoryTitle(r.category) }];
    if (r.screen === 'leaf') {
      const categoryId = SETTINGS_LEAVES.find((l) => l.id === r.leaf)?.category || 'housekeeping';
      return [
        root,
        { label: categoryTitle(categoryId), onClick: () => setRoute({ screen: 'category', category: categoryId }) },
        { label: leafTitle(r.leaf) },
      ];
    }
    if (r.screen === 'property') {
      return [
        root,
        { label: categoryTitle('properties'), onClick: () => setRoute({ screen: 'category', category: 'properties' }) },
        { label: propertyTitle(r.code) },
      ];
    }
    // property-leaf
    return [
      root,
      { label: categoryTitle('properties'), onClick: () => setRoute({ screen: 'category', category: 'properties' }) },
      { label: propertyTitle(r.code), onClick: () => setRoute({ screen: 'property', code: r.code }) },
      { label: propertyLeafTitle(r.leaf) },
    ];
  }

  // "Mitarbeiter" verlaesst Settings komplett (bestehender, admin-only Bottom-Nav-Tab 'team') -
  // dafuer wird bewusst NIE ein 'leaf'-Routenwechsel ausgeloest (das wuerde einen setState-Aufruf
  // waehrend des naechsten Renders eines KOMPLETT anderen Screens erfordern), sondern direkt beim
  // Klick navigiert.
  function openLeaf(leaf: SettingsLeafId) {
    if (leaf === 'team-members') {
      setActiveNav('team');
      return;
    }
    setRoute({ screen: 'leaf', leaf });
  }

  async function openPropertyLeaf(code: string, leaf: PropertyLeafId) {
    if (leaf === 'apartments') {
      await selectProperty(code);
      setActiveNav('rooms');
      return;
    }
    setRoute({ screen: 'property-leaf', code, leaf });
  }

  function renderLeafContent(leaf: SettingsLeafId) {
    if (leaf === 'housekeeping-rules') return <RulesScreen app={app} />;
    if (leaf === 'housekeeping-times') return <StandardTimesScreen app={app} />;
    if (leaf === 'housekeeping-linen') return <ItemCatalogSettingsScreen app={app} kind="linen" />;
    if (leaf === 'team-companies') return <HousekeepingTeamsScreen app={app} />;
    if (leaf === 'team-permissions') return <PermissionsOverviewScreen app={app} />;
    if (leaf === 'team-property-access') return <PropertyAccessOverviewScreen app={app} />;
    if (leaf === 'reports-incidents') return <IncidentsOverviewScreen app={app} />;
    if (leaf === 'reports-consumables') return <ConsumableReportsOverviewScreen app={app} />;
    if (leaf === 'system-language') {
      return (
        <div className="flex flex-col gap-1.5 px-4">
          <LanguagePicker app={app} />
        </div>
      );
    }
    return null;
  }

  function renderPropertyLeafContent(code: string, leaf: PropertyLeafId) {
    if (leaf === 'linen') return <ItemCatalogSettingsScreen app={app} kind="linen" propertyFilter={code} />;
    if (leaf === 'consumables') return <ItemCatalogSettingsScreen app={app} kind="consumable" propertyFilter={code} />;
    if (leaf === 'team') return <HousekeepingTeamsScreen app={app} propertyFilter={code} />;
    if (leaf === 'nfc') return <NfcSettingsScreen app={app} propertyFilter={code} />;
    return null;
  }

  if (route.screen !== 'root') {
    const crumbs = crumbsFor(route);
    let content: ReactNode = null;
    if (route.screen === 'category') {
      if (route.category === 'properties') {
        content = (
          <div className="flex flex-col gap-2 px-4">
            {state.properties.map((p) => (
              <SettingsRow key={p.code} label={getPropertyDisplayName(p)} onClick={() => setRoute({ screen: 'property', code: p.code })} />
            ))}
          </div>
        );
      } else if (route.category === 'integrations') {
        content = <IntegrationsScreen app={app} />;
      } else {
        const leaves = leavesForCategory(route.category).filter((l) => canSeeSettingsEntry(l.requiredRole, roleCtx));
        content = (
          <div className="flex flex-col gap-2 px-4">
            {leaves.map((leaf) => (
              <SettingsRow
                key={leaf.id}
                label={t(leaf.titleKey)}
                value={leaf.id === 'system-language' ? state.lang.toUpperCase() : undefined}
                onClick={() => openLeaf(leaf.id)}
              />
            ))}
            {route.category === 'system' ? <SettingsRow label={t('version_system_row_label')} value={`v${APP_VERSION}`} /> : null}
          </div>
        );
      }
    } else if (route.screen === 'leaf') {
      content = renderLeafContent(route.leaf);
    } else if (route.screen === 'property') {
      const leaves = PROPERTY_DETAIL_LEAVES.filter((l) => canSeeSettingsEntry(l.requiredRole, roleCtx));
      content = (
        <div className="flex flex-col gap-2 px-4">
          {leaves.map((leaf) => (
            <SettingsRow key={leaf.id} label={t(leaf.titleKey)} onClick={() => openPropertyLeaf(route.code, leaf.id)} />
          ))}
        </div>
      );
    } else if (route.screen === 'property-leaf') {
      content = renderPropertyLeafContent(route.code, route.leaf);
    }

    return (
      <div className="mx-auto w-full max-w-[1000px]">
        <SettingsHeader crumbs={crumbs} backLabel={t('settings_back')} />
        <div className="mt-3">{content}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t('settings_title')}</h2>

      {visibleCategoryIds.size === 0 ? (
        <p className="text-[13px] text-muted">{t('settings_empty_for_role')}</p>
      ) : (
        SETTINGS_CATEGORY_GROUPS.map((group) => {
          const categories = group.categories.filter((id) => visibleCategoryIds.has(id));
          if (categories.length === 0) return null;
          return (
            <div key={group.labelKey} className="flex flex-col gap-2">
              <SectionLabel>{t(group.labelKey)}</SectionLabel>
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3">
                {categories.map((id) => {
                  const def = SETTINGS_CATEGORIES.find((c) => c.id === id)!;
                  const Icon = def.icon;
                  return (
                    <Card key={id} onClick={() => setRoute({ screen: 'category', category: id })} className="flex items-start gap-3 p-4">
                      <Icon width={20} height={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-ink">{t(def.titleKey)}</p>
                          <IconChevronDown width={16} height={16} className="-rotate-90 shrink-0 text-muted" aria-hidden="true" />
                        </div>
                        <p className="mt-0.5 truncate text-[12.5px] text-muted">{t(def.descriptionKey)}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
