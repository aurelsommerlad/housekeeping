'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { ConsumableItem, LinenItem } from '@/lib/housekeeping/types';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { IconChevronDown } from '@/components/ui/icons';
import { ItemFormSheet } from './ItemFormSheet';

type CatalogKind = 'linen' | 'consumable';
type CatalogItem = LinenItem | ConsumableItem;

export interface ItemCatalogSettingsScreenProps {
  app: HousekeepingApp;
  kind: CatalogKind;
  /** Einstellungen > Standorte & Apartments > <Property> (Punkt 2) - wenn gesetzt, zeigt die Liste
   * nur Artikel, die bereits diesem Property zugeordnet sind, und eine hier neu angelegte Position
   * wird direkt diesem Property zugeordnet vorbelegt. Reine Anzeige-/Vorbelegungsfilterung - das
   * Datenmodell/die Artikel selbst bleiben global (weiterhin mehreren Properties zuordenbar). */
  propertyFilter?: string;
}

/**
 * Gemeinsame Admin-Katalogverwaltung fuer Waesche/Bettsachen UND Verbrauchsmaterial (Briefing
 * Punkt 6/12) - EINE Implementierung statt zweier parallel gepflegter Listen-Screens, nur ueber
 * `kind` parametrisiert (Titel/Aktionen/Schaetzregel-Sichtbarkeit im ItemFormSheet). Reihenfolge
 * per Rauf-/Runter-Pfeilen statt Drag&Drop (Punkt 6 "Reihenfolge aendern") - bewusst die einfachere,
 * ohne Zusatzbibliothek zuverlaessig bedienbare Loesung.
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
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="italic text-lg text-[#17160f]">{t(kind === 'linen' ? 'linen_settings_title' : 'consumable_settings_title')}</h2>
      <Button variant="primary" className="w-full" onClick={() => setEditing(null)}>
        + {t('catalog_new_item')}
      </Button>

      {sorted.map((item, index) => (
        <Card key={item.id} onClick={() => setEditing(item)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-ink">{item.name}</span>
            <Badge>{item.active ? t('active_label') : t('inactive_label')}</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {item.unit}
            {item.propertyIds.length > 0 ? ` · ${item.propertyIds.map((code) => {
              const prop = state.properties.find((p) => p.code === code);
              return prop ? getPropertyDisplayName(prop) : code;
            }).join(', ')}` : ` · ${t('catalog_no_properties')}`}
          </p>
          <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </Card>
      ))}

      {sorted.length === 0 ? <p className="text-[13px] text-muted">{t('catalog_empty')}</p> : null}

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
