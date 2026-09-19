import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/**
 * Kompakter Filter-Chip / Segmented-Control-Baustein (Briefing Punkt 6: "keine unnoetig
 * grossen Buttons"). Wird fuer Statusfilter in der Zimmeruebersicht verwendet.
 */
export function Chip({ active, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-page',
        active
          ? 'border-ink bg-ink text-warm-white'
          : 'border-line bg-warm-white text-muted hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
