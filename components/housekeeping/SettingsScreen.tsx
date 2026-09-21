'use client';

import { useState, type ReactNode } from 'react';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isAdmin, isTeamLead } from '@/lib/housekeeping/permissions';
import {
  PROPERTY_DETAIL_LEAVES, SETTINGS_CATEGORIES, SETTINGS_CATEGORY_GROUPS, SETTINGS_LEAVES, canSeeSettingsEntry,
  leavesForCategory, type PropertyLeafId, type SettingsCategoryId, type SettingsLeafId,
} from '@/lib/housekeeping/settingsNav';
import { AdminPage, AdminRow, AdminRowList, AdminSection, type AdminBreadcrumb } from './admin';
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

export interface SettingsScreenProps {
  app: HousekeepingApp;
}

/** Navigations-"Route" innerhalb der Einstellungen - EIN kleiner Stack statt eines flachen
 * Enum-Views (jederzeit klar, wo sich der Admin befindet), da die Struktur bis zu 4 Ebenen tief
 * ist (Einstellungen > Standorte & Apartments > <Property> > Wäsche & Bettsachen). */
type SettingsRoute =
  | { screen: 'root' }
  | { screen: 'category'; category: SettingsCategoryId }
  | { screen: 'leaf'; leaf: SettingsLeafId }
  | { screen: 'property'; code: string }
  | { screen: 'property-leaf'; code: string; leaf: PropertyLeafId };

/**
 * Zentrale Einstellungsseite (Briefing: "Wir haben bewusst entschieden, kein separates
 * Admin-Backend fuer den laufenden Betrieb zu haben. Administrative Funktionen muessen deshalb
 * innerhalb der normalen Housekeeping-App erreichbar sein."). Nur ueber das Profilmenue
 * (SettingsSheet -> "Einstellungen") erreichbar, als activeNav-Screen innerhalb derselben App.
 *
 * DESIGN: das Layout (AdminPage/AdminSection/AdminRow, siehe ./admin/) ist 1:1 vom tatsaechlichen
 * Owner-Center-Quellcode uebertragen (https://github.com/aurelsommerlad/owner-center,
 * src/app/admin/(protected)/properties/[id]/page.tsx als Vorlage fuer Zurueck-Link/Titel/
 * Subline/Card-Aufbau) - keine geschaetzten Werte, siehe die Komponenten-Kommentare dort fuer die
 * jeweilige Quelle. Die Startseite zeigt nur noch 3 gruppierte Cards (HOUSEKEEPING/VERWALTUNG/
 * SYSTEM) mit Zeilen statt 6 Einzelkacheln. Bestehende Bildschirme (RulesScreen/
 * StandardTimesScreen/NfcSettingsScreen/HousekeepingTeamsScreen/ItemCatalogSettingsScreen/...)
 * bleiben UNVERAENDERT die jeweils einzige Implementierung, hier nur an neuer Stelle eingehaengt
 * bzw. (Standorte & Apartments) mit einem propertyFilter wiederverwendet. Die serverseitige
 * role/property-Pruefung je API-Route bleibt die eigentliche Absicherung - diese Navigation ist
 * reine Client-UX.
 */
export function SettingsScreen({ app }: SettingsScreenProps) {
  const { state, t, setActiveNav, selectProperty } = app;
  const [route, setRoute] = useState<SettingsRoute>({ screen: 'root' });

  const admin = isAdmin(state.user);
  const lead = isTeamLead(state.user);
  const roleCtx = { admin, lead };

  const visibleCategories = SETTINGS_CATEGORIES.filter((c) => canSeeSettingsEntry(c.requiredRole, roleCtx));
  const visibleCategoryIds = new Set(visibleCategories.map((c) => c.id));

  function categoryDef(id: SettingsCategoryId) {
    return SETTINGS_CATEGORIES.find((c) => c.id === id);
  }
  function categoryTitle(id: SettingsCategoryId): string {
    const def = categoryDef(id);
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

  /** Vollstaendiger Pfad ab "Einstellungen" - nur auf Desktop gezeigt (AdminPage). */
  function crumbsFor(r: SettingsRoute): AdminBreadcrumb[] {
    const root: AdminBreadcrumb = { label: t('settings_title'), onClick: r.screen !== 'root' ? () => setRoute({ screen: 'root' }) : undefined };
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
    return [
      root,
      { label: categoryTitle('properties'), onClick: () => setRoute({ screen: 'category', category: 'properties' }) },
      { label: propertyTitle(r.code), onClick: () => setRoute({ screen: 'property', code: r.code }) },
      { label: propertyLeafTitle(r.leaf) },
    ];
  }

  // "Mitarbeiter" verlaesst Settings komplett (bestehender, admin-only Bottom-Nav-Tab 'team') -
  // dafuer wird bewusst NIE ein 'leaf'-Routenwechsel ausgeloest, sondern direkt beim Klick navigiert.
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
        <AdminSection title={t('language_label')}>
          <LanguagePicker app={app} />
        </AdminSection>
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
    const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
    const title = crumbs[crumbs.length - 1].label;
    let subtitle: string | undefined;
    let content: ReactNode = null;

    if (route.screen === 'category') {
      subtitle = categoryDef(route.category) ? t(categoryDef(route.category)!.descriptionKey) : undefined;
      if (route.category === 'properties') {
        content = (
          <AdminSection>
            <AdminRowList>
              {state.properties.map((p) => (
                <AdminRow key={p.code} title={getPropertyDisplayName(p)} onClick={() => setRoute({ screen: 'property', code: p.code })} />
              ))}
            </AdminRowList>
          </AdminSection>
        );
      } else if (route.category === 'integrations') {
        content = <IntegrationsScreen app={app} />;
      } else {
        const leaves = leavesForCategory(route.category).filter((l) => canSeeSettingsEntry(l.requiredRole, roleCtx));
        content = (
          <AdminSection>
            <AdminRowList>
              {leaves.map((leaf) => (
                <AdminRow
                  key={leaf.id}
                  title={t(leaf.titleKey)}
                  value={leaf.id === 'system-language' ? state.lang.toUpperCase() : undefined}
                  onClick={() => openLeaf(leaf.id)}
                />
              ))}
            </AdminRowList>
          </AdminSection>
        );
      }
    } else if (route.screen === 'leaf') {
      content = renderLeafContent(route.leaf);
    } else if (route.screen === 'property') {
      const leaves = PROPERTY_DETAIL_LEAVES.filter((l) => canSeeSettingsEntry(l.requiredRole, roleCtx));
      content = (
        <AdminSection>
          <AdminRowList>
            {leaves.map((leaf) => (
              <AdminRow key={leaf.id} title={t(leaf.titleKey)} onClick={() => openPropertyLeaf(route.code, leaf.id)} />
            ))}
          </AdminRowList>
        </AdminSection>
      );
    } else if (route.screen === 'property-leaf') {
      content = renderPropertyLeafContent(route.code, route.leaf);
    }

    return (
      <AdminPage title={title} subtitle={subtitle} back={back} crumbs={crumbs}>
        {content}
      </AdminPage>
    );
  }

  return (
    <AdminPage title={t('settings_title')}>
      {visibleCategoryIds.size === 0 ? (
        <p className="text-sm text-muted">{t('settings_empty_for_role')}</p>
      ) : (
        SETTINGS_CATEGORY_GROUPS.map((group) => {
          const categories = group.categories.filter((id) => visibleCategoryIds.has(id));
          if (categories.length === 0) return null;
          return (
            <AdminSection key={group.labelKey} eyebrow={t(group.labelKey)}>
              <AdminRowList>
                {categories.map((id) => {
                  const def = categoryDef(id)!;
                  return (
                    <AdminRow
                      key={id}
                      title={t(def.titleKey)}
                      description={t(def.descriptionKey)}
                      onClick={() => setRoute({ screen: 'category', category: id })}
                    />
                  );
                })}
              </AdminRowList>
            </AdminSection>
          );
        })
      )}
    </AdminPage>
  );
}
