import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { FEATURE_LABELS } from '@/lib/status';
import { describeTurnover } from '@/lib/turnover';
import type { Unit } from '@/lib/types';

export interface UnitCardProps {
  unit: Unit;
  onOpen?: (unit: Unit) => void;
}

const MAX_VISIBLE_FEATURES = 2;

/**
 * Das zentrale operative Element (Briefing Punkt 7). Zeigt auf einen Blick: Name, Status,
 * Turnover-Info, zustaendige Person, Besonderheiten - aber nur die Informationen, die
 * tatsaechlich vorhanden/relevant sind. Bewusst KEINE vollflaechig eingefaerbte Statuskarte,
 * Status kommt ueber eine schmale StatusPill.
 */
export function UnitCard({ unit, onOpen }: UnitCardProps) {
  const turnoverLabel = describeTurnover(unit.turnover);
  const visibleFeatures = unit.features.slice(0, MAX_VISIBLE_FEATURES);
  const hiddenFeatureCount = unit.features.length - visibleFeatures.length;

  return (
    <Card onClick={onOpen ? () => onOpen(unit) : undefined} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xl font-semibold tracking-tight text-ink">{unit.name}</span>
        {unit.assignedTo ? <Avatar initials={unit.assignedTo.initials} size="sm" /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={unit.status} size="sm" short />
        {unit.needsAttention ? (
          <span className="text-[11.5px] font-medium text-status-attention">Aufmerksamkeit</span>
        ) : null}
      </div>

      {turnoverLabel ? <p className="text-[13px] text-muted">{turnoverLabel}</p> : null}

      {(visibleFeatures.length > 0 || unit.needsDoubleUp) && (
        <div className="flex flex-wrap gap-1.5">
          {visibleFeatures.map((feature) => (
            <Badge key={feature.id} count={feature.count}>
              {FEATURE_LABELS[feature.id]}
            </Badge>
          ))}
          {hiddenFeatureCount > 0 ? <Badge>+{hiddenFeatureCount} Extras</Badge> : null}
          {unit.needsDoubleUp ? <Badge className="border-sage/40 bg-status-clean-bg">Aufdoppeln</Badge> : null}
        </div>
      )}
    </Card>
  );
}
