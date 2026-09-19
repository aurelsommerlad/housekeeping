import { NAV_ITEMS, type NavItemId } from '@/lib/nav';
import { NAV_ICONS } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface NavBarProps {
  activeId: NavItemId;
  onSelect: (id: NavItemId) => void;
  variant: 'sidebar' | 'bottom';
  className?: string;
}

/**
 * Eine Navigation, zwei Darstellungen - dieselben `NAV_ITEMS` werden auf Mobile als fixe
 * Bottom-Tab-Bar und auf Desktop als ruhige Sidebar-Liste gerendert (Briefing Punkt 5: deutlich
 * ruhiger als die Referenz, fuer Mobile geeignet).
 */
export function NavBar({ activeId, onSelect, variant, className }: NavBarProps) {
  if (variant === 'sidebar') {
    return (
      <nav className={cn('flex flex-col gap-0.5', className)}>
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium transition-colors',
                active ? 'bg-surface text-ink' : 'text-muted hover:bg-surface/60 hover:text-ink',
              )}
            >
              <Icon width={18} height={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        'grid shrink-0 border-t border-line bg-warm-white pb-[max(env(safe-area-inset-bottom),0.5rem)]',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-[10.5px] font-medium transition-colors',
              active ? 'text-forest' : 'text-muted',
            )}
          >
            <Icon width={20} height={20} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
