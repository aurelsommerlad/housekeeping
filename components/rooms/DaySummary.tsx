import { STATUS_CONFIG, STATUS_ORDER } from '@/lib/status';
import type { Unit } from '@/lib/types';

export interface DaySummaryProps {
  units: Unit[];
}

/**
 * Kompakte Tageszusammenfassung (Briefing Punkt 6) - keine grossen KPI-Kacheln, sondern eine
 * ruhige Zeile mit Zahl + Statuslabel je relevantem Status.
 */
export function DaySummary({ units }: DaySummaryProps) {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: units.filter((u) => u.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="px-4 pt-5 pb-1 md:px-0 md:pt-0">
      <h1 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Heute</h1>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        {counts.length === 0 ? (
          <p className="text-sm text-muted">Keine Einheiten für diese Property.</p>
        ) : (
          counts.map(({ status, count }) => (
            <p key={status} className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-ink">{count}</span>
              <span className="text-[13px] text-muted">{STATUS_CONFIG[status].shortLabel}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}
