import type { StaffUser } from '@/lib/housekeeping/types';
import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { BottomSheet } from './BottomSheet';

export interface BulkAssignSheetProps {
  open: boolean;
  lang: Lang;
  housekeepers: StaffUser[];
  count: number;
  shortName: (name: string | null | undefined) => string;
  onPick: (hk: StaffUser) => void;
  onClose: () => void;
}

/**
 * Ersetzt den frueheren `prompt()`-Dialog fuer die Mehrfachzuweisung durch ein hochwertiges
 * Bottom Sheet - dieselbe Aktion (assignmentsApi.bulkSet), nur eine passende Oberflaeche dafuer.
 * Punkt 2 (UX-Feinschliff): Picker-Liste zeigt wie ueberall im operativen Bereich nur den
 * Vornamen (mit Kollisions-Disambiguierung) - der gespeicherte Name (`hk.name`) bleibt
 * unveraendert, es aendert sich ausschliesslich die Darstellung hier.
 */
export function BulkAssignSheet({ open, lang, housekeepers, count, shortName, onPick, onClose }: BulkAssignSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h3 className="italic text-lg text-[#17160f]">
        {translate(lang, 'assign_to')} · {translate(lang, 'selected_count', { n: count })}
      </h3>
      <div className="mt-3 flex flex-col gap-1 pb-2">
        {housekeepers.length === 0 ? (
          <p className="py-4 text-sm text-muted">{translate(lang, 'no_data')}</p>
        ) : (
          housekeepers.map((hk) => (
            <button
              key={hk.id}
              type="button"
              onClick={() => onPick(hk)}
              className="flex items-center justify-between rounded-control px-3 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              {shortName(hk.name)}
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
