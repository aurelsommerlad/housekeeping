'use client';

import { IconMinus, IconPlus } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface QuantityStepperProps {
  /** `null` = "noch nicht erfasst" (zeigt "-" statt einer Zahl, Briefing Punkt 4 "-" vs. "0") -
   * wird NIE automatisch aus einem Schaetzwert vorbelegt (Punkt 3). */
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  'aria-label'?: string;
}

/**
 * Kompakter Mengen-Stepper (Briefing Punkt 5 "schnelle mobile Eingabe") - grosse Touch Targets,
 * die Zahl in der Mitte ist ein `inputmode="numeric"`-Feld (direktes Antippen + Zifferntastatur
 * moeglich, Punkt 5 "optional"). Ein Klick auf "-" bei `value === null` startet bei 0 (der erste
 * bewusste Tastendruck ist damit bereits eine aktive Eingabe, kein automatisch uebernommener
 * Schaetzwert - Punkt 3/4 bleiben dadurch niemals vermischt).
 */
export function QuantityStepper({ value, onChange, min = 0, max = 999, ...aria }: QuantityStepperProps) {
  function step(delta: number) {
    const base = value ?? 0;
    const next = Math.min(max, Math.max(min, base + delta));
    onChange(next);
  }

  function handleInput(raw: string) {
    if (raw.trim() === '') return;
    const parsed = Number(raw.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  }

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={aria['aria-label']}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value !== null && value <= min}
        aria-label="-1"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
      >
        <IconMinus width={15} height={15} aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value === null ? '' : String(value)}
        placeholder="–"
        onChange={(e) => handleInput(e.target.value)}
        className={cn(
          'h-9 w-11 rounded-control border border-line bg-warm-white text-center text-[15px] font-medium tabular-nums text-ink',
          value === null && 'text-muted',
        )}
      />
      <button
        type="button"
        onClick={() => step(1)}
        disabled={value !== null && value >= max}
        aria-label="+1"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
      >
        <IconPlus width={15} height={15} aria-hidden="true" />
      </button>
    </div>
  );
}
