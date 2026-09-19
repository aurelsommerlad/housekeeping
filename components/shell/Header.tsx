import { IconUser } from '@/components/ui/icons';

/**
 * Zurueckhaltendes Branding (Briefing Punkt 13): "UNIQUE PLACES" (nie kursiv) als kleine,
 * getrackte Wortmarke, "HOUSEKEEPING" als sekundaeres Label darunter - keine grosse Logo-
 * Bildmarke, keine fremd wirkende Produktidentitaet.
 *
 * Profil-/Einstellungsfunktionen haengen bewusst nur als Icon am Header, nicht als
 * gleichwertiger Haupt-Tab (Briefing Punkt 5).
 */
export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 md:h-[72px] md:px-8">
      <div className="leading-none">
        <p className="brand-wordmark text-[11px] font-semibold tracking-[0.18em] text-ink">
          UNIQUE PLACES
        </p>
        <p className="mt-1 text-[15px] font-medium tracking-[0.04em] text-muted">
          Housekeeping
        </p>
      </div>
      <button
        type="button"
        aria-label="Profil und Einstellungen"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-page"
      >
        <IconUser width={17} height={17} />
      </button>
    </header>
  );
}
