import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { DoubleupIcon } from '@/components/ui/icons';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface DoubleupScreenProps {
  app: HousekeepingApp;
}

/** Uebersicht aller Zimmer mit offener Zusatzausstattung ("Aufdoppeln"). */
export function DoubleupScreen({ app }: DoubleupScreenProps) {
  const { state, t, rooms, openRoom } = app;
  const list = rooms().filter((r) => r.doubleup?.types?.length);

  if (list.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-muted">{t('no_data')}</div>;
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <h2 className="font-heading text-lg italic text-ink">{t('doubleup_needed')}</h2>
      {list.map((r) => (
        <Card key={r.key}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-ink">{t('room_detail')} {r.number}</span>
            <Button variant="secondary" size="sm" onClick={() => openRoom(r.key)}>
              {t('room_detail')}
            </Button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {DOUBLEUP_TYPES.filter((dt) => r.doubleup!.types.includes(dt.id)).map((dt) => (
              <span
                key={dt.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1 text-[12.5px] font-medium text-warm-white"
              >
                <DoubleupIcon id={dt.id} width={16} height={16} aria-hidden="true" />
                {t(dt.label)}
              </span>
            ))}
          </div>
          {r.doubleup?.note ? (
            <p className="mt-2.5 rounded-control border border-line bg-surface px-3 py-2 text-[13px] text-ink">{r.doubleup.note}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
