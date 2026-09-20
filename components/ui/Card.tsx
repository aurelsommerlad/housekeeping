import type { HTMLAttributes, KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Macht die gesamte Card tap-/klickbar (Tastatur + Maus), z. B. fuer Unit Cards. */
  onClick?: () => void;
}

/**
 * Generische Card-Huelle: grosszuegiger Innenabstand, dezente Border, kleiner Radius,
 * sehr subtiler Schatten - bewusst kein vollflaechig eingefaerbter Status-Hintergrund
 * (siehe Briefing Punkt 7).
 */
export function Card({ onClick, className, children, ...props }: CardProps) {
  const interactive = typeof onClick === 'function';

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  }

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-card-lg border border-line bg-warm-white p-5 shadow-card-lg',
        interactive && 'cursor-pointer transition-colors hover:border-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-page',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
