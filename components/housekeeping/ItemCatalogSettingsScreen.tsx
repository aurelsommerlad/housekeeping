'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { ConsumableItem, LinenItem } from '@/lib/housekeeping/types';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { Button } from '@/components/ui/Button';
import { IconChevronDown } from '@/components/ui/icons';
import { AdminBadge, AdminRowList, AdminSection } from './admin';
import { ItemFormSheet } from './ItemFormSheet';

type CatalogKind = 'linen' | 'consumable';
type CatalogItem = LinenItem | ConsumableItem;

export interface ItemCatalogSettingsScreenProps {
  app: HousekeepingApp;
  kind: CatalogKind;
  /** Einstellungen > Standorte & Apartments > <Property> - wenn gesetzt, zeigt die Liste nur
   * Artikel, die bereits diesem Property zugeordnet sind, und eine hier neu angelegte Position
   * wird direkt diesem Property zugeordnet vorbelegt. Reine Anzeige-/Vorbelegungsfilterung - das
   * Datenmodell/die Artikel selbst bleiben global (weiterhin mehreren Properties zuordenbar). */
  propertyFilter?: string;
}

/**
 * Gemeinsame Admin-Katalogverwaltung fuer Waesche/Bettsachen UND Verbrauchsmaterial - EINE
 * Implementierung statt zweier parallel gepflegter Listen-Screens, nur ueber `kind`
 * parametrisiert (Titel/Aktionen/Schaetzregel-Sichtbarkeit im ItemFormSheet). Reihenfolge per
 * Rauf-/Runter-Pfeilen statt Drag&Drop - bewusst die einfachere, ohne Zusatzbibliothek
 * zuverlaessig bedienbare Loesung.
 */
export function ItemCatalogSettingsScreen({ app, kind, propertyFilter }: ItemCatalogSettingsScreenProps) {
  const { state, t, reorderLinenItems, reorderConsumableItems } = app;
  const items: CatalogItem[] = kind === 'linen' ? state.linenItems : state.consumableItems;
  const visible = propertyFilter ? items.filter((item) => item.propertyIds.includes(propertyFilter)) : items;
  const sorted = [...visible].sort((a, b) => a.sortOrder - b.sortOrder);
  const [editing, setEditing] = useState<CatalogItem | null | undefined>(undefined);

  // `sortOrder` ist ein EINZIGES globales Feld ueber den gesamten Katalog (nicht je Property) -
  // beim gefilterten Aufruf (propertyFilter) tauscht `move` deshalb die zwei betroffenen Artikel
  // innerhalb der VOLLSTAENDIGEN, unfilterten Reihenfolge, ausgewaehlt ueber ihre Nachbarschaft in
  // der sichtbaren (gefilterten) Liste - das haelt die globale Sortierung anderer Properties
  // korrekt, waehrend "rauf/runter" innerhalb der gefilterten Ansicht trotzdem das Erwartete tut.
  async function move(itemId: string, delta: number) {
    const visibleIndex = sorted.findIndex((item) => item.id === itemId);
    const neighbor = sorted[visibleIndex + delta];
    if (!neighbor) return;
    const globalSorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const currentGlobalIndex = globalSorted.findIndex((item) => item.id === itemId);
    const neighborGlobalIndex = globalSorted.findIndex((item) => item.id === neighbor.id);
    const reordered = [...globalSorted];
    [reordered[currentGlobalIndex], reordered[neighborGlobalIndex]] = [reordered[neighborGlobalIndex], reordered[currentGlobalIndex]];
    const orderedIds = reordered.map((item) => item.id);
    if (kind === 'linen') await reorderLinenItems(orderedIds);
    else await reorderConsumableItems(orderedIds);
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminSection actions={<Button variant="secondary" size="sm" onClick={() => setEditing(null)}>+ {t('catalog_new_item')}</Button>}>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted">{t('catalog_empty')}</p>
        ) : (
          <AdminRowList>
            {sorted.map((item, index) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(item); } }}
                className="flex cursor-pointer flex-col gap-1.5 py-4 text-left first:pt-0 last:pb-0"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{item.name}</span>
                  <AdminBadge label={item.active ? t('active_label') : t('inactive_label')} tone={item.active ? 'positive' : 'muted'} />
                </span>
                <span className="text-xs text-muted">
                  {item.unit}
                  {item.propertyIds.length > 0 ? ` · ${item.propertyIds.map((code) => {
                    const prop = state.properties.find((p) => p.code === code);
                    return prop ? getPropertyDisplayName(prop) : code;
                  }).join(', ')}` : ` · ${t('catalog_no_properties')}`}
                </span>
                <span className="mt-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(item.id, -1)}
                    aria-label={t('catalog_move_up')}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <IconChevronDown width={15} height={15} className="rotate-180" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === sorted.length - 1}
                    onClick={() => move(item.id, 1)}
                    aria-label={t('catalog_move_down')}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <IconChevronDown width={15} height={15} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </AdminRowList>
        )}
      </AdminSection>

      {editing !== undefined ? (
        <ItemFormSheet
          app={app}
          kind={kind}
          item={editing}
          properties={state.properties}
          defaultPropertyIds={propertyFilter ? [propertyFilter] : undefined}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}
