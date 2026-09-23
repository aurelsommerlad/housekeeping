import type { ComponentType, SVGProps } from 'react';

/**
 * Kleines, selbst gezeichnetes Icon-Set (Strichstaerke 1.5, 20x20) - bewusst ohne externe
 * Icon-Library, um keine unnoetige Dependency einzufuehren (Briefing Punkt 17).
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconBed(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" />
      <path d="M3 18v2M21 18v2" />
      <path d="M3 12V8a2 2 0 0 1 2-2h5v4" />
      <path d="M11 10h9" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

/** Reinigungs-/Housekeeping-Symbol (Korrektur UX-Feinschliff Runde 4, ersetzt IconLayers als
 * Akzent fuer "Reinigungen" - IconLayers wirkte visuell/semantisch nicht eindeutig genug als
 * Reinigungssymbol). Ein vierzackiges Funkeln/"Sparkle" ("frisch gereinigt/glaenzend") plus zwei
 * kleine Nebenfunken, im selben Strich-/Kein-Fuellton-Stil wie die uebrigen Icons gezeichnet. */
export function IconSparkles(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 1.6 4.7a2.2 2.2 0 0 0 1.4 1.4L19.5 11l-4.5 1.6a2.2 2.2 0 0 0-1.4 1.4L12 19l-1.6-4.7a2.2 2.2 0 0 0-1.4-1.4L4.5 11l4.5-1.6a2.2 2.2 0 0 0 1.4-1.4L12 3Z" />
      <path d="M19 3.5v3M18 5h3" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 9a2.5 2.5 0 1 0 0-5" />
      <path d="M15 20a5.5 5.5 0 0 0-2.3-8.9" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.3" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function IconChecklist(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Ersetzt das Babybett-Emoji - kein exaktes "Krippe"-Icon im bestehenden Set, daher ein
 * eigenes, stilistisch passendes Gitterbett gezeichnet (Rahmen + Seitenstreben), statt auf ein
 * Emoji zurueckzufallen. */
export function IconCrib(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 20V9a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11" />
      <path d="M5 20h14" />
      <path d="M8 8V5M12 8V5M16 8V5" />
    </svg>
  );
}

/** Ersetzt das Hund-Emoji - Pfotenabdruck statt Hundesilhouette (Briefing nennt beides als
 * Option), rein aus Linien/Kreisen im selben Stil wie die uebrigen Icons (kein Fill). */
export function IconPawPrint(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="16.5" r="3.5" />
      <circle cx="6" cy="10.5" r="1.8" />
      <circle cx="10" cy="6.5" r="1.8" />
      <circle cx="14" cy="6.5" r="1.8" />
      <circle cx="18" cy="10.5" r="1.8" />
    </svg>
  );
}

/** Fuer den "Auswaehlen"-Button (Mehrfachauswahl-Einstieg in der Aufgabenplanung) - Checkbox-
 * Rahmen + Haekchen, dieselbe Outline-Sprache (kein Fuellton) wie die uebrigen Icons. Bewusst ein
 * eigenes Icon statt IconCheck wiederzuverwenden, das an anderer Stelle bereits "erledigt/
 * bestaetigt" bedeutet (Arbeitsstatus, Hinweis-Bestaetigung) - unterschiedliche Bedeutung soll
 * nicht dasselbe Symbol teilen. */
export function IconCheckSquare(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12.5 2.5 2.5 5-5" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Fuer den Mengen-Stepper (Waescheverbrauch/Verbrauchsmaterial) - siehe QuantityStepper.tsx. */
export function IconMinus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

/** Fuer den "Wichtiger Hinweis"-Block (Punkt 3) und die dezente Warnkennzeichnung auf
 * Planungskarten (Punkt 9) - bewusst kein farbiges/gefuelltes Ausrufezeichen-Icon. */
export function IconAlertCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v6" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

/** Fuer Late-Check-out-/Early-Check-in-Kennzeichnung auf Task Card/Detail (dezent, monochrom,
 * kein Wecker/Warnsymbol) - dieselbe Outline-Sprache wie IconAlertCircle. */
export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/** Fuer die manuelle Zeiten-Bearbeitung (Admin-Override) - Stift/Bearbeiten-Symbol, dezent statt
 * eines Warnsymbols, da eine bewusste Aenderung (keine Fehlermeldung) markiert wird. */
export function IconEdit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/** Fuer die NFC-Tag-Verwaltung (Admin-Einstellungen) und den kompakten NFC-Scan-Einstieg - ein
 * Geraet/Tag (abgerundetes Rechteck) mit zwei radial abstrahlenden Kontaktlos-Wellen, dieselbe
 * Outline-Sprache wie die uebrigen Icons (kein Emoji, kein Fuellton). */
export function IconNfc(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="6" width="10" height="15" rx="2.5" />
      <path d="M16.5 9.5c1 1 1.5 2.2 1.5 3.5s-.5 2.5-1.5 3.5" />
      <path d="M19 6.5c2 2 3 4 3 6.5s-1 4.5-3 6.5" />
    </svg>
  );
}

/** Fuer die Admin-Reservierungssuche (Header-Button) - klassische Lupe, dieselbe Outline-Sprache
 * wie die uebrigen Icons. */
export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.7-4.7" />
    </svg>
  );
}

/** Fuer den Arbeitsstatus "Pausiert" auf der kompakten Aufgabenkarte (Task-Card-Redesign) - zwei
 * schlichte Balken, dieselbe Outline-Sprache wie die uebrigen Icons, ersetzt dort das reine
 * Unicode-Glyph aus TASK_STATUS_CONFIG (das bleibt fuer TonePill/TaskDetailSheet unveraendert). */
export function IconPause(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

/** Fuer den Arbeitsstatus "In Reinigung" auf der kompakten Aufgabenkarte - schlichtes,
 * ungefuelltes Play-Dreieck, dieselbe Outline-Sprache wie die uebrigen Icons. */
export function IconPlay(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 6.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

/** Fuer den dezenten Schliessen-Button im Task-Detail-Sheet (Redesign) - schlichtes X statt eines
 * grossen "Schliessen"-Buttons als vermeintlich wichtigste Aktion der Ansicht. */
export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Fuer die Belegungsanzeige auf der kompakten Task Card (Punkt 3: bewusst KEIN Flugzeug-Symbol) -
 * klassisches "Log-out"-Piktogramm (Tuer + herausfuehrender Pfeil) fuer die abreisende Belegung,
 * dieselbe Outline-Sprache wie die uebrigen Icons. */
export function IconExit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" />
      <path d="M10 12h10" />
      <path d="m16 8 4 4-4 4" />
    </svg>
  );
}

/** Fuer die Belegungsanzeige auf der kompakten Task Card - klassisches "Log-in"-Piktogramm
 * (Pfeil in eine Tuer hinein) fuer die ankommende Belegung, spiegelbildlich zu IconExit. */
export function IconEnter(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M11 4h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7" />
      <path d="M14 12H4" />
      <path d="m8 8-4 4 4 4" />
    </svg>
  );
}

/** Fuer "Standorte & Apartments" (Einstellungen-Kategorie) - ein schlichtes Gebaeude, dieselbe
 * Outline-Sprache wie die uebrigen Icons (kein Emoji, kein Fuellton). */
export function IconBuilding(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="3" width="11" height="18" rx="1" />
      <path d="M9 7h3M9 10.5h3M9 14h3" />
      <path d="M16 10h3v11h-3" />
    </svg>
  );
}

/** Fuer "Integrationen" (Einstellungen-Kategorie) - ein Stecker/Verbindungssymbol, dieselbe
 * Outline-Sprache wie die uebrigen Icons. */
export function IconPlug(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0V8Z" />
      <path d="M12 15.5V21" />
    </svg>
  );
}

/** Fuer "App & System" (Einstellungen-Kategorie) - ein schlichtes Zahnrad, dieselbe Outline-
 * Sprache wie die uebrigen Icons. */
export function IconGear(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5" />
      <path d="M17.7 6.3l-1.55 1.55M7.85 16.15 6.3 17.7M17.7 17.7l-1.55-1.55M7.85 7.85 6.3 6.3" />
    </svg>
  );
}

/** Fuer manuelle Aufgaben (Punkt 1: "Reinigung" vs. "Aufgabe" klar getrennt, monochromes Icon
 * statt Farbe allein) - ein Klemmbrett mit Haekchen, bewusst kein Bett/Reinigungssymbol, damit
 * eine Aufgabe schon am Icon nicht mit einer Reinigung verwechselt werden kann. */
export function IconTask(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="m8.5 13 2 2 4-4" />
    </svg>
  );
}

/** Fuer den dezenten "Buchung geändert"-Hinweis auf Karte/Detail (Punkt 9) - zwei umlaufende
 * Pfeile (Refresh/Change), dieselbe Outline-Sprache wie die uebrigen Icons. */
export function IconRefresh(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}

/** Fuer Vorher->Nachher-Aenderungen (Nutzerfeedback "Buchung geändert" Kartenlayout) - schlichter
 * Pfeil nach rechts statt eines reinen Textzeichens ("->" bzw. "→"), damit ein Wertepaar (z. B.
 * "23.09. -> 24.09.") klar als Uebergang statt als Fliesstext lesbar bleibt. */
export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h16" />
      <path d="M13 6l7 6-7 6" />
    </svg>
  );
}

/** Fuer "Wieder aktiviert" (Briefing "Statuskorrektur Icons") - EIN umlaufender Gegenuhrzeiger-
 * Pfeil (Undo/Rueckgaengig-Sprache), bewusst optisch UNTERSCHIEDLICH von IconRefresh (zwei
 * gegenlaeufige Pfeile, dort fuer "etwas hat sich veraendert"/Buchungsaenderung) - "Wieder
 * aktiviert" bedeutet konkret "ein Schritt zurueckgenommen", nicht "etwas hat sich veraendert". */
export function IconRotateCcw(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 3.5v5.5h5.5" />
      <path d="M4.2 9A8.5 8.5 0 1 1 5.7 16" />
    </svg>
  );
}

/** Fuer "Geplant für" (Nutzerfeedback "Datum auf Hoehe der Zeit positionieren") - schlichte
 * Kalenderflaeche ohne Uhr, bewusst UNTERSCHIEDLICH von IconCalendarClock darunter: dieses Icon
 * markiert nur "hier steht ein Datum", waehrend IconCalendarClock weiterhin ausschliesslich fuer
 * den "Termin verschoben"-Badge steht. */
export function IconCalendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}

/** Fuer "Termin verschoben" (Briefing "Statuskorrektur Icons") - Kalenderflaeche mit kleiner Uhr,
 * bewusst optisch UNTERSCHIEDLICH von IconRotateCcw/IconRefresh: eindeutig "ein Datum/Termin ist
 * betroffen", nicht "etwas wurde rueckgaengig gemacht" oder "eine Buchung hat sich geaendert". */
export function IconCalendarClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <circle cx="15.5" cy="15" r="3.3" />
      <path d="M15.5 13.3V15l1.1.9" />
    </svg>
  );
}

/** Fuer den Reservierungskommentar innerhalb von "Buchung" (Briefing "Reinigungsdetailansicht
 * ueberarbeiten" Punkt 2) - schlichte Sprechblase, macht den Kommentar als sekundaeres Zitat
 * innerhalb der Buchungsinfo erkennbar statt eines gleichrangigen eigenen Abschnitts. */
export function IconMessageCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.2-3.6A7.96 7.96 0 0 1 4 12Z" />
    </svg>
  );
}

/** Fuer "Automatisch übersetzt" (Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 5) - ein
 * schlichtes Globus-Symbol als allgemein verstaendliches Sprach-/Uebersetzungssymbol, bewusst
 * dezent und ohne eigene Bedeutungsfarbe (Text traegt die eigentliche Aussage, siehe
 * auto_translated_label). */
export function IconGlobe(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z" />
    </svg>
  );
}

/** Fuer "Buchung in Apaleo öffnen" (Briefing "Reinigungsdetailansicht optimieren" Punkt 5) -
 * schlichtes Standard-Symbol fuer einen externen Link/neuen Tab, admin-only neben der jeweiligen
 * Reservierung. */
export function IconExternalLink(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
    </svg>
  );
}

/** "•••"-Menuebutton (Briefing Punkt 9: Bearbeiten/Entfernen des wichtigen Hinweises nicht mehr
 * dauerhaft sichtbar, sondern hinter diesem Menue). */
export function IconMoreHorizontal(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Fuer "Aus Buchung übernommen" (Briefing Punkt 15) - dezenter Info-Hinweis, ausschliesslich fuer
 * Admin/Standortverantwortliche sichtbar. */
export function IconInfo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.2v5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Fuer "Einladungslink kopieren" (Briefing "Team-/Benutzerverwaltung ueberarbeiten") - zwei
 * ueberlappende Rechtecke, dieselbe Outline-Sprache wie die uebrigen Icons. */
export function IconCopy(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/** Fuer "Einladung widerrufen"/"Benutzer deaktivieren" - schlichter Papierkorb, dieselbe
 * Outline-Sprache wie die uebrigen Icons (keine Warnfarbe im Icon selbst, das uebernimmt der
 * Button-Kontext). */
export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7" />
      <path d="M10.2 11v6" />
      <path d="M13.8 11v6" />
    </svg>
  );
}

/** Fuer "Einladung erneut senden"/"Mitarbeiter einladen" - Briefumschlag, dieselbe Outline-
 * Sprache wie die uebrigen Icons. */
export function IconMail(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </svg>
  );
}

export const NAV_ICONS = {
  bed: IconBed,
  chart: IconChart,
  layers: IconLayers,
  book: IconBook,
  checklist: IconChecklist,
  users: IconUsers,
  alert: IconAlertCircle,
};

/** Loest komplett die frueheren Emojis (👶/🛏️/🐕/➕) auf den Zusatzausstattungs-Buttons/-Chips
 * ab (Task Cards, Task-/Room-Detail, DoubleupScreen) - dieselbe Icon-Sprache (Outline,
 * currentColor, 1.6 Strichstaerke) wie ueberall sonst in der App, keine zweite Icon-Library. */
export const DOUBLEUP_ICONS: Record<string, ComponentType<IconProps>> = {
  crib: IconCrib,
  sofabed: IconBed,
  dog: IconPawPrint,
  extra: IconPlus,
};

export function DoubleupIcon({ id, ...props }: IconProps & { id: string }) {
  const Icon = DOUBLEUP_ICONS[id];
  return Icon ? <Icon {...props} /> : null;
}
