import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Label/Wert-Paar - woertlicher Port der `Field`-Komponente von der Owner-Center-
 * Property-Detailseite (src/app/admin/(protected)/properties/[id]/page.tsx#Field).
 */
export function AdminField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm text-ink">{value}</p>
    </div>
  );
}

/** Responsives Grid mehrerer AdminField (Owner Center: 2 Spalten mobil, 4 ab `lg:`). */
export function AdminFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4', className)}>{children}</div>;
}
