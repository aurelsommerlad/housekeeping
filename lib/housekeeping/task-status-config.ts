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
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, ToneConfig> = {
  open: {
    labelKey: 'wf_open',
    toneClass: 'text-status-dirty',
    toneBgClass: 'bg-status-dirty-bg',
    toneBorderClass: 'border-status-dirty/30',
    dotClass: 'bg-status-dirty',
  },
  assigned: {
    labelKey: 'wf_assigned',
    toneClass: 'text-status-dirty',
    toneBgClass: 'bg-status-dirty-bg',
    toneBorderClass: 'border-status-dirty/30',
    dotClass: 'bg-status-dirty',
  },
  in_progress: {
    labelKey: 'st_running',
    toneClass: 'text-status-progress',
    toneBgClass: 'bg-status-progress-bg',
    toneBorderClass: 'border-status-progress/30',
    dotClass: 'bg-status-progress',
    pulse: true,
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
  },
};

/** Same-Day-Turnover behaelt die hohe, "attention"-artige Sichtbarkeit, die Turnover-Zeilen im
 * bestehenden RoomCard schon hatten (Punkt 9: TURNOVER = hoechste operative Prioritaet).
 * Stayover/Zwangsreinigung nutzt dieselbe Attention-Farbe wie das bestehende "forced"-Badge
 * (WORKFLOW_STATUS_CONFIG.forced) - unveraendert uebernommen. */
export const TASK_TYPE_CONFIG: Record<TaskType, ToneConfig> = {
  turnover: {
    labelKey: 'type_turnover',
    toneClass: 'text-status-attention',
    toneBgClass: 'bg-status-attention-bg',
    toneBorderClass: 'border-status-attention/30',
    dotClass: 'bg-status-attention',
  },
  departure: {
    labelKey: 'type_departure',
    toneClass: 'text-status-dirty',
    toneBgClass: 'bg-status-dirty-bg',
    toneBorderClass: 'border-status-dirty/30',
    dotClass: 'bg-status-dirty',
  },
  stayover: {
    labelKey: 'type_stayover',
    toneClass: 'text-status-attention',
    toneBgClass: 'bg-status-attention-bg',
    toneBorderClass: 'border-status-attention/30',
    dotClass: 'bg-status-attention',
  },
  extra: {
    labelKey: 'type_extra',
    toneClass: 'text-status-blocked',
    toneBgClass: 'bg-status-blocked-bg',
    toneBorderClass: 'border-status-blocked/30',
    dotClass: 'bg-status-blocked',
  },
};
