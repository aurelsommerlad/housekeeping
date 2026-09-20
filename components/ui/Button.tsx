import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Hover-/Disabled-Verhalten 1:1 aus dem echten Owner-Center-Quellcode uebernommen (dort
// durchgaengig `rounded-full ... hover:opacity-90 disabled:opacity-50` fuer primaere Aktionen,
// `border border-line text-ink-soft hover:border-ink hover:text-ink` fuer sekundaere) - siehe
// z. B. src/components/admin/AddOwnerButton.tsx dort.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-warm-white transition-opacity hover:opacity-90',
  secondary: 'border border-line text-muted transition-colors hover:border-ink hover:text-ink',
  ghost: 'bg-transparent text-muted transition-colors hover:text-ink',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'h-11 px-5 text-sm',
  sm: 'h-9 px-4 text-[13px]',
};

/**
 * Basis-Button mit drei Varianten (primary = starke Aktion, secondary = Standardaktion,
 * ghost = zurueckhaltende/sekundaere Aktion). Kraeftige, dunkle Flaechen statt bunter
 * PMS-Buttons - siehe Briefing Punkt 2/14.
 */
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-page',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
