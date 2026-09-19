import { WORKFLOW_STATUS_CONFIG } from '@/lib/housekeeping/status-config';
import type { WorkflowStatus } from '@/lib/housekeeping/types';
import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { cn } from '@/lib/cn';

export interface WorkflowStatusPillProps {
  status: WorkflowStatus;
  lang: Lang;
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Status wird nie nur ueber Farbe kommuniziert (Briefing Punkt 7): Punkt + Textlabel sind immer
 * beide da. "Pause" nutzt dieselbe Grundfarbe wie "In Reinigung", aber als Outline-Variante
 * statt einer neuen Farbe - so bleiben beide Zustaende klar unterscheidbar, ohne die ruhige
 * Statuspalette zu erweitern.
 */
export function WorkflowStatusPill({ status, lang, size = 'md', className }: WorkflowStatusPillProps) {
  const config = WORKFLOW_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        config.outline ? 'bg-warm-white' : config.toneBgClass,
        config.toneBorderClass,
        config.toneClass,
        size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11.5px]',
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dotClass, config.pulse && 'animate-pulse')}
        aria-hidden="true"
      />
      {translate(lang, config.labelKey)}
    </span>
  );
}
