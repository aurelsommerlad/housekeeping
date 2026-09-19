import { STATUS_CONFIG } from '@/lib/status';
import type { UnitStatus } from '@/lib/types';
import { cn } from '@/lib/cn';

export interface StatusPillProps {
  status: UnitStatus;
  /** Kompaktere Variante fuer engere Kontexte (z. B. Unit-Card-Kopf). */
  size?: 'md' | 'sm';
  /** Kurzform (z. B. "Reinigung" statt "Reinigung erforderlich") fuer die Unit Card;
   * die lange Form bleibt fuer die Detailansicht reserviert. */
  short?: boolean;
  className?: string;
}

/**
 * Status wird NIE nur ueber Farbe kommuniziert (Briefing Punkt 2): Punkt + Textlabel sind
 * immer beide vorhanden. Farbtoene kommen ausschliesslich aus den zentralen Status-Tokens
 * (lib/status.ts), damit Status app-weit konsistent aussieht.
 */
export function StatusPill({ status, size = 'md', short, className }: StatusPillProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        config.toneBgClass,
        config.toneBorderClass,
        config.toneClass,
        size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11.5px]',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dotClass)} aria-hidden="true" />
      {short ? config.shortLabel : config.label}
    </span>
  );
}
