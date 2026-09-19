export interface PlaceholderSectionProps {
  title: string;
}

/**
 * Ehrlicher Platzhalter fuer Bereiche, die in diesem Schritt noch nicht gebaut sind (Statistik,
 * Aufdoppeln, Regeln, Team) - bewusst keine erfundene Business-Logik oder Demo-Zahlen
 * (Briefing Punkt 15/17/18: nur Designsystem + App-Shell + Zimmeruebersicht-Prototyp).
 */
export function PlaceholderSection({ title }: PlaceholderSectionProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-20 text-center md:px-0">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-xs text-[13px] text-muted">
        Dieser Bereich folgt in einem nächsten Schritt, sobald die Datenanbindung steht.
      </p>
    </div>
  );
}
