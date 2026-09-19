import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Optionale Menge, z. B. 2 -> "2× Babybett". */
  count?: number;
}

/**
 * Kleine, hochwertige Pille fuer Besonderheiten/Extras (Babybett, Hund, "+2 Extras", ...).
 * Bewusst neutral gehalten (keine Statusfarbe), damit Merkmale die Statusinformation der
 * Unit Card nicht ueberlagern - siehe Briefing Punkt 8.
 */
export function Badge({ count, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink',
        className,
      )}
      {...props}
    >
      {count && count > 1 ? <span className="text-muted">{count}×</span> : null}
      {children}
    </span>
  );
}
