import type { WorkflowStatus } from './types';
import type { I18nKey } from './i18n';

/**
 * Zentrale Farbkonfiguration je Workflow-Status - dieselben gedaempften Status-Tokens wie im
 * Adminbereich (app/globals.css), damit Housekeeping und Admin optisch eine Familie bleiben.
 * `outline` = true zeigt eine ungefuellte Variante (z. B. "Pause" vs. "In Reinigung" mit
 * derselben Grundfarbe) statt eine zusaetzliche, neue Farbe einzufuehren.
 */
export interface WorkflowStatusConfig {
  labelKey: I18nKey;
  toneClass: string;
  toneBgClass: string;
  toneBorderClass: string;
  dotClass: string;
  outline?: boolean;
  pulse?: boolean;
}

export const WORKFLOW_STATUS_CONFIG: Record<WorkflowStatus, WorkflowStatusConfig> = {
  forced: {
    labelKey: 'st_forced',
    toneClass: 'text-status-attention',
    toneBgClass: 'bg-status-attention-bg',
    toneBorderClass: 'border-status-attention/30',
    dotClass: 'bg-status-attention',
  },
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
  running: {
    labelKey: 'st_running',
    toneClass: 'text-status-progress',
    toneBgClass: 'bg-status-progress-bg',
    toneBorderClass: 'border-status-progress/30',
    dotClass: 'bg-status-progress',
    pulse: true,
  },
  paused: {
    labelKey: 'wf_paused',
    toneClass: 'text-status-progress',
    toneBgClass: 'bg-surface',
    toneBorderClass: 'border-status-progress/40',
    dotClass: 'bg-status-progress',
    outline: true,
  },
  inspect: {
    labelKey: 'st_inspect',
    toneClass: 'text-status-inspection',
    toneBgClass: 'bg-status-inspection-bg',
    toneBorderClass: 'border-status-inspection/30',
    dotClass: 'bg-status-inspection',
  },
  done: {
    labelKey: 'wf_done',
    toneClass: 'text-status-clean',
    toneBgClass: 'bg-status-clean-bg',
    toneBorderClass: 'border-status-clean/30',
    dotClass: 'bg-status-clean',
  },
  locked: {
    labelKey: 'st_locked',
    toneClass: 'text-status-blocked',
    toneBgClass: 'bg-status-blocked-bg',
    toneBorderClass: 'border-status-blocked/30',
    dotClass: 'bg-status-blocked',
  },
};
