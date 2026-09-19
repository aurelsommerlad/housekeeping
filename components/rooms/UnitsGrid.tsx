import { UnitCard } from './UnitCard';
import type { Unit } from '@/lib/types';

export interface UnitsGridProps {
  units: Unit[];
  onOpenUnit?: (unit: Unit) => void;
}

/** Kein verkleinertes Desktop-Tabellen-Layout auf Mobile (Briefing Punkt 4) - echtes Karten-Grid. */
export function UnitsGrid({ units, onOpenUnit }: UnitsGridProps) {
  if (units.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-muted md:px-0">
        Keine Einheiten für diesen Filter.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-3 lg:grid-cols-4 md:px-0">
      {units.map((unit) => (
        <UnitCard key={unit.id} unit={unit} onOpen={onOpenUnit} />
      ))}
    </div>
  );
}
