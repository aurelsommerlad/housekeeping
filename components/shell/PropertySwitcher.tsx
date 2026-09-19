'use client';

import { useState } from 'react';
import type { Property } from '@/lib/types';
import { cn } from '@/lib/cn';
import { IconChevronDown } from '@/components/ui/icons';

export interface PropertySwitcherProps {
  properties: Property[];
  activeId: string;
  onChange: (id: string) => void;
  /** "scroll" = horizontale Chip-Reihe (mobil), "inline" = Dropdown-Button (Desktop-Sidebar). */
  variant?: 'scroll' | 'inline';
  className?: string;
}

/**
 * Property-Switcher als eigenstaendige UI-Komponente. Haeuser kommen ausschliesslich aus den
 * uebergebenen Daten (`properties`) - keine hartkodierten Namen in der Komponente selbst
 * (Briefing Punkt 12).
 */
export function PropertySwitcher({ properties, activeId, onChange, variant = 'scroll', className }: PropertySwitcherProps) {
  const [open, setOpen] = useState(false);
  const active = properties.find((p) => p.id === activeId) ?? properties[0];

  if (variant === 'inline') {
    return (
      <div className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-control border border-line bg-warm-white px-3.5 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:border-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <span>{active?.name ?? 'Haus wählen'}</span>
          <IconChevronDown width={15} height={15} className={cn('text-muted transition-transform', open && 'rotate-180')} />
        </button>
        {open ? (
          <ul className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-control border border-line bg-warm-white py-1 shadow-card">
            {properties.map((property) => (
              <li key={property.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(property.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center px-3.5 py-2 text-left text-sm transition-colors hover:bg-surface',
                    property.id === activeId ? 'font-medium text-ink' : 'text-muted',
                  )}
                >
                  {property.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      {properties.map((property) => (
        <button
          key={property.id}
          type="button"
          onClick={() => onChange(property.id)}
          aria-pressed={property.id === activeId}
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors',
            property.id === activeId
              ? 'border-ink bg-ink text-warm-white'
              : 'border-line bg-warm-white text-muted hover:text-ink',
          )}
        >
          {property.name}
        </button>
      ))}
    </div>
  );
}
