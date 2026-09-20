import type { ToneConfig } from '@/lib/housekeeping/task-status-config';
import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { cn } from '@/lib/cn';

export interface TonePillProps {
  config: ToneConfig;
  lang: Lang;
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Generischer Punkt+Text-Pill fuer Task-Status/-Typ (lib/housekeeping/task-status-config.ts) -
 * identisches Rendering wie WorkflowStatusPill (siehe dort), nur ohne die dortige
 * Housekeeper-spezifische Outline-Sonderregel fuer "Pause", da Task-Status diesen Zustand nicht
 * kennt. Status/Typ wird nie nur ueber Farbe kommuniziert - Punkt + Textlabel sind immer beide da.
 */
export function TonePill({ config, lang, size = 'md', className }: TonePillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        config.toneBgClass, config.toneBorderClass, config.toneClass,
        size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11.5px]',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dotClass, config.pulse && 'animate-pulse')} aria-hidden="true" />
      {translate(lang, config.labelKey)}
    </span>
  );
}
