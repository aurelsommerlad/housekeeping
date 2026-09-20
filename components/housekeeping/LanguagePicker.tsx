'use client';

import { LANGUAGES } from '@/lib/housekeeping/i18n';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

export interface LanguagePickerProps {
  app: HousekeepingApp;
}

/** Sprachauswahl (DE/EN/PL/RO) - gemeinsam genutzt vom Profilmenue und der Einstellungsseite. */
export function LanguagePicker({ app }: LanguagePickerProps) {
  const { state, setLang } = app;

  return (
    <div className="flex gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            'flex-1 rounded-control border px-3 py-2 text-[13px] font-semibold uppercase transition-colors',
            state.lang === l ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
