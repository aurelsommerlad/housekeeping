// Woertlicher Port von adminFormStyles.ts (Owner Center), auf Housekeeping-Tokens gemappt
// (border-line/bg-warm-white/text-ink/text-muted sind exakt dieselben Werte wie dort
// border-line/bg-paper/text-ink/text-ink-soft) - gemeinsame Klassen fuer Formularfelder im
// gesamten Einstellungs-/Adminbereich, statt sie in jeder Datei neu zu erfinden.
export const ADMIN_INPUT_CLASS =
  'w-full rounded-control border border-line bg-warm-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink';

export const ADMIN_SELECT_CLASS = ADMIN_INPUT_CLASS;

export const ADMIN_LABEL_CLASS = 'text-[11px] uppercase tracking-[0.08em] text-muted';
