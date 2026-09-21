import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AdminBreadcrumb {
  label: string;
  onClick?: () => void;
}

export interface AdminPageProps {
  title: string;
  subtitle?: string;
  /** Zurueck-Link mit dem TATSAECHLICHEN Namen der Elternseite (Owner Center: "← Objekte"),
   * nie ein generisches "Zurueck" - dieselbe Zeile traegt auf Mobile die gesamte Navigation
   * zurueck (Punkt "Navigation in tieferen Ebenen": keine erzwungene lange Breadcrumb-Zeile). */
  back?: AdminBreadcrumb;
  /** Vollstaendiger Pfad ab "Einstellungen" - nur ab `sm:` sichtbar (Punkt "Desktop kann die
   * Hierarchie dezent sichtbar sein"), auf Mobile bewusst nie gerendert. */
  crumbs?: AdminBreadcrumb[];
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Seitenrahmen fuer den gesamten Einstellungs-/Adminbereich - Owner-Center-Pattern 1:1
 * uebertragen (siehe src/app/admin/(protected)/properties/[id]/page.tsx dort: Zurueck-Link,
 * h1 `text-2xl font-semibold text-ink`, Subline `text-sm text-muted`, Aktionen rechts oben,
 * Owner-Center-artige Content-Breite). Ersetzt die bisherige, generische "Zurueck"-BackBar.
 */
export function AdminPage({ title, subtitle, back, crumbs, actions, children }: AdminPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        {crumbs && crumbs.length > 1 ? (
          <nav className="mb-2 hidden flex-wrap items-center gap-1.5 text-xs text-muted sm:flex" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true">›</span> : null}
                {crumb.onClick ? (
                  <button type="button" onClick={crumb.onClick} className="transition-colors hover:text-ink">
                    {crumb.label}
                  </button>
                ) : (
                  <span className="font-medium text-ink">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            className="text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            ← {back.label}
          </button>
        ) : null}
        <div className={cn('flex flex-wrap items-start justify-between gap-3', back ? 'mt-2' : '')}>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
