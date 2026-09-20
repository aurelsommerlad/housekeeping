import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/cn';

export interface TimeFlagProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
  tone?: 'muted' | 'attention';
}

/**
 * Kleine, dezente Icon+Text-Kennzeichnung fuer An-/Abreisezeit-Besonderheiten (Late Check-out/
 * Early Check-in/Zeitkonflikt/manueller Override) - bewusst kein eigenes farbiges Pill wie
 * TonePill (das bleibt Status/Typ vorbehalten), sondern reiner Inline-Text+Icon, gemeinsam von
 * TaskCard und TaskDetailSheet genutzt, damit beide Ansichten dieselbe Bildsprache verwenden.
 */
export function TimeFlag({ icon: Icon, children, tone = 'muted' }: TimeFlagProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-medium', tone === 'attention' ? 'text-status-attention' : 'text-muted')}>
      <Icon width={13} height={13} aria-hidden="true" />
      {children}
    </span>
  );
}
