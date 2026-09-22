import type { TaskStatus, TaskType } from './types';
import type { I18nKey } from './i18n';

/**
 * Farbkonfiguration fuer Task-Status/-Typ - dieselben zentralen Status-Tokens wie
 * status-config.ts (WorkflowStatus), damit Aufgaben-Ansicht und Apartments-Ansicht optisch eine
 * Familie bleiben. Analoges Muster (Punkt 9/10): Typ wird nie nur ueber Farbe kommuniziert,
 * Punkt + Textlabel sind immer beide da.
 */
export interface ToneConfig {
  labelKey: I18nKey;
  toneClass: string;
  toneBgClass: string;
  toneBorderClass: string;
  dotClass: string;
  pulse?: boolean;
  /** Ersetzt den Farbpunkt durch ein Glyph (z. B. "✓" bei "Fertig") - Status/Typ wird dadurch
   * weiterhin nie nur ueber Farbe kommuniziert, hier zusaetzlich deutlich statt nur farblich. */
  icon?: string;
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, ToneConfig> = {
  open: {
    labelKey: 'wf_open',
    toneClass: 'text-status-dirty',
    toneBgClass: 'bg-status-dirty-bg',
    toneBorderClass: 'border-status-dirty/30',
    dotClass: 'bg-status-dirty',
  },
  // Nutzerfeedback: "zugewiesen" ist ein positiver Zwischenschritt (jemand ist verantwortlich),
  // kein Warnzustand - bekommt deshalb denselben gruenen Ton wie "completed" statt des roten
  // "dirty"-Tons von "open" (unzugewiesen, muss noch verteilt werden).
  assigned: {
    labelKey: 'wf_assigned',
    toneClass: 'text-status-clean',
    toneBgClass: 'bg-status-clean-bg',
    toneBorderClass: 'border-status-clean/30',
    dotClass: 'bg-status-clean',
  },
  in_progress: {
    labelKey: 'st_running',
    toneClass: 'text-status-progress',
    toneBgClass: 'bg-status-progress-bg',
    toneBorderClass: 'border-status-progress/30',
    dotClass: 'bg-status-progress',
    pulse: true,
  },
  // Eigener, dezenter Grauton (--color-status-blocked, bisher ungenutzt) statt Wiederverwendung
  // einer der "aktiven" Statusfarben - "Pausiert" ist bewusst weder dringend (progress) noch neu
  // (dirty), sondern ein neutraler Zwischenzustand. Glyph "Ⅱ" statt Punkt, analog zu "✓" bei
  // completed - Status wird dadurch nie nur ueber Farbe kommuniziert.
  paused: {
    labelKey: 'task_paused_label',
    toneClass: 'text-status-blocked',
    toneBgClass: 'bg-status-blocked-bg',
    toneBorderClass: 'border-status-blocked/30',
    dotClass: 'bg-status-blocked',
    icon: 'Ⅱ',
  },
  inspection: {
    labelKey: 'st_inspect',
    toneClass: 'text-status-inspection',
    toneBgClass: 'bg-status-inspection-bg',
    toneBorderClass: 'border-status-inspection/30',
    dotClass: 'bg-status-inspection',
  },
  completed: {
    labelKey: 'wf_done',
    toneClass: 'text-status-clean',
    toneBgClass: 'bg-status-clean-bg',
    toneBorderClass: 'border-status-clean/30',
    dotClass: 'bg-status-clean',
    icon: '✓',
  },
};

/** Eigene, sehr zurueckhaltende Aufgabentyp-Farben (--color-type-*, app/globals.css) - bewusst
 * getrennt von den Status-Farben oben: Kartenfarbe = Art der Aufgabe (hier), Bearbeitungsstatus
 * bleibt ausschliesslich ueber TASK_STATUS_CONFIG sichtbar. `toneBgClass` dient TaskCard.tsx
 * zugleich als Kartenhintergrund - ein Typ hat also GENAU einen Hintergrund- und einen
 * Akzentton, nirgends zusaetzlich vermischt mit Status-Farben. */
export const TASK_TYPE_CONFIG: Record<TaskType, ToneConfig> = {
  // Briefing "DEPARTURE/TURNOVER vereinheitlichen": beide sind fuer Housekeeping primaer eine
  // Reinigung nach Abreise - `turnover` und `departure` teilen sich deshalb hier bewusst
  // DIESELBEN Ton-Klassen (das bisherige Turnover-Rot/Terracotta), Kartenfarbe/Akzent werden
  // dadurch automatisch identisch (siehe TaskCard.tsx#toneBgClass als Kartenhintergrund). Der
  // Unterschied bleibt ausschliesslich ueber das Label erkennbar (labelKey), NICHT ueber eine
  // zweite Farbe (Punkt 6) - `--color-type-departure` (app/globals.css) bleibt als CSS-Variable
  // bestehen, da sie an anderer, unabhaengiger Stelle (TasksScreen.tsx-Kennzahl "Aufgaben" auf
  // Mobile) weiterhin gebraucht wird und dort NICHT veraendert werden soll.
  turnover: {
    labelKey: 'type_turnover',
    toneClass: 'text-type-turnover',
    toneBgClass: 'bg-type-turnover-bg',
    toneBorderClass: 'border-type-turnover/30',
    dotClass: 'bg-type-turnover',
  },
  departure: {
    labelKey: 'type_departure',
    toneClass: 'text-type-turnover',
    toneBgClass: 'bg-type-turnover-bg',
    toneBorderClass: 'border-type-turnover/30',
    dotClass: 'bg-type-turnover',
  },
  stayover: {
    labelKey: 'type_stayover',
    toneClass: 'text-type-stayover',
    toneBgClass: 'bg-type-stayover-bg',
    toneBorderClass: 'border-type-stayover/30',
    dotClass: 'bg-type-stayover',
  },
  extra: {
    labelKey: 'type_extra',
    toneClass: 'text-type-extra',
    toneBgClass: 'bg-type-extra-bg',
    toneBorderClass: 'border-type-extra/30',
    dotClass: 'bg-type-extra',
  },
  // Punkt 1 (Feinschliff-Analyse): manuelle Aufgabe - eigener Neutralton (siehe app/globals.css),
  // damit sie schon farblich klar von jeder Reinigung unterscheidbar ist. Nie nur ueber Farbe:
  // TaskCard zeigt zusaetzlich IconTask + das explizite Label "Aufgabe" (siehe TaskCard.tsx).
  manual: {
    labelKey: 'type_manual',
    toneClass: 'text-type-manual',
    toneBgClass: 'bg-type-manual-bg',
    toneBorderClass: 'border-type-manual/30',
    dotClass: 'bg-type-manual',
  },
};
