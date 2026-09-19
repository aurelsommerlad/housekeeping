'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Generischer Bottom Sheet - fuer Zimmer-Detail, Mehrfachzuweisung und Benutzerformular
 * gleichermassen genutzt (Briefing Punkt 9: "hochwertiger Bottom Sheet" statt klassisches
 * zentriertes Modal auf Mobile). Schliesst per Tap auf den Hintergrund; der Inhalt selbst
 * scrollt bei Bedarf, das Sheet respektiert die untere Safe Area.
 */
export function BottomSheet({ open, onClose, children, className }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card bg-warm-white shadow-card',
          'pb-[max(env(safe-area-inset-bottom),1rem)]',
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
        <div className="overflow-y-auto px-5 pb-2 pt-3">{children}</div>
      </div>
    </div>
  );
}
