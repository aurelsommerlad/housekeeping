import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { Button } from '@/components/ui/Button';

export interface MultiSelectBarProps {
  lang: Lang;
  count: number;
  onAssign: () => void;
  onCancel: () => void;
}

/**
 * Dezente, aber klar erkennbare Aktionsleiste bei aktiver Mehrfachauswahl (Briefing Punkt 11) -
 * fixiert im unteren mobilen Bereich, damit sie mit einer Hand erreichbar bleibt.
 */
export function MultiSelectBar({ lang, count, onAssign, onCancel }: MultiSelectBarProps) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-warm-white px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-card">
      <span className="text-sm font-medium text-ink">{translate(lang, 'selected_count', { n: count })}</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {translate(lang, 'cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={onAssign}>
          {translate(lang, 'assign_selected')}
        </Button>
      </div>
    </div>
  );
}
