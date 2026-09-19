'use client';

import type { ReactNode } from 'react';
import type { Property } from '@/lib/types';
import type { NavItemId } from '@/lib/nav';
import { Header } from './Header';
import { NavBar } from './NavBar';
import { PropertySwitcher } from './PropertySwitcher';

export interface AppShellProps {
  properties: Property[];
  activePropertyId: string;
  onPropertyChange: (id: string) => void;
  activeNavId: NavItemId;
  onNavChange: (id: NavItemId) => void;
  children: ReactNode;
}

/**
 * Grundlegende App-Shell: mobile-first (Header + horizontaler Property-Switcher + Content +
 * Bottom-Nav), auf Desktop ergaenzt um eine ruhige linke Sidebar mit Property-Switcher und
 * Navigation (hoehere Informationsdichte, siehe Briefing Punkt 4/14).
 */
export function AppShell({
  properties,
  activePropertyId,
  onPropertyChange,
  activeNavId,
  onNavChange,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-page md:flex-row">
      <aside className="hidden shrink-0 border-r border-line bg-warm-white md:flex md:w-64 md:flex-col md:gap-6 md:p-6">
        <div className="leading-none">
          <p className="brand-wordmark text-[11px] font-semibold tracking-[0.18em] text-ink">
            UNIQUE PLACES
          </p>
          <p className="mt-1 text-[15px] font-medium tracking-[0.04em] text-muted">Housekeeping</p>
        </div>
        <PropertySwitcher
          properties={properties}
          activeId={activePropertyId}
          onChange={onPropertyChange}
          variant="inline"
        />
        <NavBar variant="sidebar" activeId={activeNavId} onSelect={onNavChange} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <Header />
          <PropertySwitcher
            properties={properties}
            activeId={activePropertyId}
            onChange={onPropertyChange}
            variant="scroll"
            className="border-b border-line"
          />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl md:px-8 md:py-6">{children}</div>
        </main>

        <NavBar variant="bottom" activeId={activeNavId} onSelect={onNavChange} className="md:hidden" />
      </div>
    </div>
  );
}
