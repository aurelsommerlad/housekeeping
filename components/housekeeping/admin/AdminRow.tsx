import type { ReactNode } from 'react';
import { IconChevronDown } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** Mehrere AdminRow innerhalb EINER Card, per Trennlinie geteilt statt als eigene Cards -
 * Owner-Center-Zeilenoptik (z. B. AdminTable: `divide-y divide-line`) statt gestapelter
 * Einzelkarten. */
export function AdminRowList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col divide-y divide-line', className)}>{children}</div>;
}

export interface AdminRowProps {
  title: string;
  description?: string;
  /** Klickbar (Navigations-Zeile, Chevron rechts) wenn gesetzt - sonst reine Anzeige-Zeile. */
  onClick?: () => void;
  /** Kurzer Wert rechts neben dem Titel (z. B. aktuelle Sprache) - wie die bisherige SettingsRow. */
  value?: string;
  badge?: ReactNode;
}

/**
 * Eine Zeile innerhalb einer AdminSection-Card: Titel (+ Chevron, wenn klickbar) auf einer
 * Zeile, Beschreibung darunter - genau das vom Nutzer vorgegebene Muster ("Housekeeping ›" /
 * "Regeln, Zeiten, Wäsche und Reinigungsabläufe"). Bewusst OHNE fuehrendes Icon (das
 * tatsaechliche Owner-Center-Zeilenmuster - Field/AdminTable/IntegrationsPage-Listen - fuehrt
 * nirgends mit einem Icon).
 */
export function AdminRow({ title, description, onClick, value, badge }: AdminRowProps) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 py-4 text-left first:pt-0 last:pb-0',
        interactive && 'transition-colors hover:text-ink',
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-muted">
          {value ? <span className="text-[13px]">{value}</span> : null}
          {badge}
          {interactive ? <IconChevronDown width={16} height={16} className="-rotate-90 shrink-0" aria-hidden="true" /> : null}
        </span>
      </span>
      {description ? <span className="text-xs text-muted">{description}</span> : null}
    </Tag>
  );
}
