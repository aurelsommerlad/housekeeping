import { cn } from '@/lib/cn';

export type AdminBadgeTone = 'positive' | 'strong' | 'neutral' | 'muted';

// Woertlicher Port von AdminStatusBadge (Owner Center) - dieselbe Pillen-Chrome wie die
// bestehende Housekeeping-Badge (border-line/bg-warm-white/text-muted), nur der Punkt traegt
// Bedeutung. Farben sind exakt dieselben Tokens wie im Owner Center (#87977E/#52664E dort =
// sage/forest hier).
const DOT_CLASS: Record<AdminBadgeTone, string> = {
  positive: 'bg-sage',
  strong: 'bg-forest',
  neutral: 'bg-muted',
  muted: 'border border-ink/25 bg-transparent',
};

export function AdminBadge({ label, tone = 'neutral', className }: { label: string; tone?: AdminBadgeTone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-warm-white px-2.5 py-1 text-xs font-medium text-muted',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASS[tone])} />
      {label}
    </span>
  );
}
