import type { RoomFilter } from '@/lib/housekeeping/types';
import type { Lang } from '@/lib/housekeeping/i18n';
import type { I18nKey } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { Chip } from '@/components/ui/Chip';

const FILTERS: { id: RoomFilter; labelKey: I18nKey; dotClass?: string }[] = [
  { id: 'all', labelKey: 'filter_all' },
  { id: 'forced', labelKey: 'filter_forced', dotClass: 'bg-status-attention' },
  { id: 'dirty', labelKey: 'filter_dirty', dotClass: 'bg-status-dirty' },
  { id: 'inspect', labelKey: 'filter_inspect', dotClass: 'bg-status-inspection' },
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
