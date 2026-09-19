import { allowedProperties } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

/**
 * Haus-Auswahl als hochwertige Chip-Reihe statt technisch wirkendem Dropdown (Briefing
 * Punkt 12). Es ist jederzeit eindeutig sichtbar, in welchem Haus gerade gearbeitet wird -
 * der aktive Chip ist dunkel gefuellt, alle anderen zurueckhaltend.
 */
export function PropertyChips({ app }: { app: HousekeepingApp }) {
  const { state, selectProperty } = app;
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const props = state.properties.filter((p) => allowed.includes(p.code));
  if (props.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {props.map((p) => (
        <button
          key={p.code}
          type="button"
          onClick={() => selectProperty(p.code)}
          aria-pressed={state.activeProperty === p.code}
          className={cn(
            'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors',
            state.activeProperty === p.code ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
