import { cn } from '@/lib/cn';

export interface AvatarProps {
  initials: string;
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Initialen-Avatar statt grosser bunter Profilbilder (Briefing Punkt 10: "keine grossen
 * bunten Avatare").
 */
export function Avatar({ initials, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-medium text-ink',
        size === 'md' ? 'h-8 w-8 text-[12px]' : 'h-6 w-6 text-[10.5px]',
        className,
      )}
      title={initials}
    >
      {initials}
    </span>
  );
}
