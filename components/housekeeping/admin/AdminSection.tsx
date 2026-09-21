import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export interface AdminSectionProps {
  /** Kleines Uppercase-Label OBERHALB der Card (Einstellungsstartseite: "HOUSEKEEPING",
   * "VERWALTUNG", "SYSTEM") - dieselbe Typografie wie AdminField-Labels (Owner Center kennt
   * keine eigene "Section-Eyebrow"-Komponente, das ist derselbe kleine Uppercase-Meta-Stil,
   * hier nur oberhalb statt innerhalb einer Card verwendet). */
  eyebrow?: string;
  /** Ueberschrift/Beschreibung INNERHALB der Card (Owner Center: "Eigentuemer & Zugriffe" auf
   * der Property-Detailseite) - optional, da die Einstellungsstartseite nur Rows ohne
   * zusaetzlichen Innentitel braucht. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Card mit optionalem Eyebrow-Label davor und optionalem Titel/Beschreibung/Aktionen darin -
 * die Grundeinheit fuer jede gruppierte Einstellungen-Flaeche (Owner Center: `<Card className="p-5
 * shadow-soft sm:p-6">`, Titel `text-sm font-semibold text-ink`, Beschreibung `text-xs text-muted`).
 */
export function AdminSection({ eyebrow, title, description, actions, className, children }: AdminSectionProps) {
  const hasHeader = !!(title || description || actions);
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? <p className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{eyebrow}</p> : null}
      <Card className={cn('p-5 sm:p-6', className)}>
        {hasHeader ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : null}
              {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
            </div>
            {actions}
          </div>
        ) : null}
        {children}
      </Card>
    </div>
  );
}
