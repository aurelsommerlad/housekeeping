import type { RoomFilter } from '@/lib/housekeeping/types';
import type { Lang } from '@/lib/housekeeping/i18n';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { FORCED_CLEAN_ENABLED, INSPECTION_ENABLED } from '@/lib/housekeeping/rooms';
import { Chip } from '@/components/ui/Chip';

// Zwangsreinigung/Inspektion aktuell deaktiviert (siehe rooms.ts) - Filter-Chips dafuer daher
// ausgeblendet, da sie sonst immer leere Ergebnisse liefern wuerden.
const FILTERS: { id: RoomFilter; labelKey: I18nKey; dotClass?: string }[] = [
  { id: 'all', labelKey: 'filter_all' },
  ...(FORCED_CLEAN_ENABLED ? [{ id: 'forced' as const, labelKey: 'filter_forced' as const, dotClass: 'bg-status-attention' }] : []),
  { id: 'dirty', labelKey: 'filter_dirty', dotClass: 'bg-status-dirty' },
  ...(INSPECTION_ENABLED ? [{ id: 'inspect' as const, labelKey: 'filter_inspect' as const, dotClass: 'bg-status-inspection' }] : []),
  { id: 'clean', labelKey: 'filter_clean', dotClass: 'bg-status-clean' },
  { id: 'doubleup', labelKey: 'filter_doubleup', dotClass: 'bg-sage' },
];

export interface FilterBarProps {
  lang: Lang;
  active: RoomFilter;
  onChange: (filter: RoomFilter) => void;
}

/** Statusfilter der Zimmeruebersicht - horizontal scrollbare Chip-Reihe, kein Dropdown. */
export function FilterBar({ lang, active, onChange }: FilterBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((f) => (
        <Chip key={f.id} active={active === f.id} onClick={() => onChange(f.id)}>
          {f.dotClass ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.dotClass}`} aria-hidden="true" /> : null}
          {translate(lang, f.labelKey)}
        </Chip>
      ))}
    </div>
  );
}
