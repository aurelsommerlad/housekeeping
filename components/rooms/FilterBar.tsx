import { Chip } from '@/components/ui/Chip';
import { STATUS_CONFIG } from '@/lib/status';
import type { UnitStatus } from '@/lib/types';

export type RoomFilter = 'all' | UnitStatus | 'doubleup';

export interface FilterBarProps {
  active: RoomFilter;
  onChange: (filter: RoomFilter) => void;
}

const FILTERS: { id: RoomFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'needs_cleaning', label: STATUS_CONFIG.needs_cleaning.shortLabel },
  { id: 'in_progress', label: STATUS_CONFIG.in_progress.shortLabel },
  { id: 'inspection', label: STATUS_CONFIG.inspection.shortLabel },
  { id: 'clean', label: STATUS_CONFIG.clean.shortLabel },
  { id: 'doubleup', label: 'Aufdoppeln' },
];

/** Kompakte Filter-Chips statt grosser Buttons (Briefing Punkt 6). */
export function FilterBar({ active, onChange }: FilterBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((filter) => (
        <Chip key={filter.id} active={active === filter.id} onClick={() => onChange(filter.id)}>
          {filter.label}
        </Chip>
      ))}
    </div>
  );
}
