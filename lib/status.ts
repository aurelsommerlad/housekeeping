import type { UnitFeatureId, UnitStatus } from './types';

/**
 * Zentrale Statuskonfiguration - jede Komponente, die einen Status anzeigt (Filter, Badge,
 * Unit Card, Detailansicht), liest von hier. So kann Status nirgends abweichend interpretiert
 * werden (Briefing Punkt 11).
 *
 * `tone`/`toneBg` referenzieren die Tailwind-Farbtokens aus app/globals.css.
 */
export interface StatusConfig {
  status: UnitStatus;
  label: string;
  shortLabel: string;
  toneClass: string;
  toneBgClass: string;
  toneBorderClass: string;
  /** Als eigenes Feld (statt zur Laufzeit aus toneClass abgeleitet), damit Tailwinds
   * statische Klassen-Analyse die Utility zuverlaessig erkennt. */
  dotClass: string;
}

export const STATUS_ORDER: UnitStatus[] = [
  'needs_cleaning',
  'in_progress',
  'inspection',
  'clean',
  'blocked',
];

export const STATUS_CONFIG: Record<UnitStatus, StatusConfig> = {
  needs_cleaning: {
    status: 'needs_cleaning',
    label: 'Reinigung erforderlich',
    shortLabel: 'Reinigung',
    toneClass: 'text-status-dirty',
    toneBgClass: 'bg-status-dirty-bg',
    toneBorderClass: 'border-status-dirty/30',
    dotClass: 'bg-status-dirty',
  },
  in_progress: {
    status: 'in_progress',
    label: 'In Reinigung',
    shortLabel: 'In Arbeit',
    toneClass: 'text-status-progress',
    toneBgClass: 'bg-status-progress-bg',
    toneBorderClass: 'border-status-progress/30',
    dotClass: 'bg-status-progress',
  },
  inspection: {
    status: 'inspection',
    label: 'Inspektion',
    shortLabel: 'Inspektion',
    toneClass: 'text-status-inspection',
    toneBgClass: 'bg-status-inspection-bg',
    toneBorderClass: 'border-status-inspection/30',
    dotClass: 'bg-status-inspection',
  },
  clean: {
    status: 'clean',
    label: 'Sauber',
    shortLabel: 'Sauber',
    toneClass: 'text-status-clean',
    toneBgClass: 'bg-status-clean-bg',
    toneBorderClass: 'border-status-clean/30',
    dotClass: 'bg-status-clean',
  },
  blocked: {
    status: 'blocked',
    label: 'Gesperrt',
    shortLabel: 'Gesperrt',
    toneClass: 'text-status-blocked',
    toneBgClass: 'bg-status-blocked-bg',
    toneBorderClass: 'border-status-blocked/30',
    dotClass: 'bg-status-blocked',
  },
};

export const FEATURE_LABELS: Record<UnitFeatureId, string> = {
  crib: 'Babybett',
  sofa_bed: 'Schlafsofa',
  dog: 'Hund',
  extra_guest: 'Zusatzperson',
  extras: 'Extras',
};
