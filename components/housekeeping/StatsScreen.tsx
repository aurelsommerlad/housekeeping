import { formatDuration, statsFor } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Card } from '@/components/ui/Card';

export interface StatsScreenProps {
  app: HousekeepingApp;
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex-1 rounded-card-lg border border-line bg-warm-white px-3 py-4 text-center">
      <p className="font-heading text-2xl italic text-ink">{value}</p>
      <p className="mt-1 text-[11.5px] text-muted">{label}</p>
    </div>
  );
}

/** Statistik-Screen (nur fuer Admins ueber die Navigation erreichbar) - 1:1 dieselben Kennzahlen wie zuvor. */
export function StatsScreen({ app }: StatsScreenProps) {
  const { state, t } = app;
  if (!state.activeProperty) return null;

  const today = statsFor(state.completions, state.activeProperty, 'today');
  const month = statsFor(state.completions, state.activeProperty, 'month');
  const year = statsFor(state.completions, state.activeProperty, 'year');

  const byHk: Record<string, number> = {};
  for (const c of year.list) {
    const name = c.housekeeperName || c.housekeeperId || '?';
    byHk[name] = (byHk[name] || 0) + 1;
  }
  const maxHk = Math.max(1, ...Object.values(byHk), 0);
  const recent = state.completions.filter((c) => c.property === state.activeProperty).slice(-15).reverse();

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <div>
        <h2 className="mb-2.5 font-heading text-lg italic text-ink">{t('stats_today')}</h2>
        <div className="flex gap-2.5">
          <StatTile value={today.count} label={t('cleaned_rooms')} />
          <StatTile value={today.avg ? formatDuration(today.avg) : '–'} label={t('avg_time')} />
          <StatTile value={today.fastest ? formatDuration(today.fastest) : '–'} label={t('fastest')} />
        </div>
      </div>

      <div>
        <h2 className="mb-2.5 font-heading text-lg italic text-ink">{t('stats_month')} / {t('stats_year')}</h2>
        <div className="flex gap-2.5">
          <StatTile value={month.count} label={t('stats_month')} />
          <StatTile value={year.count} label={t('stats_year')} />
          <StatTile value={year.avg ? formatDuration(year.avg) : '–'} label={t('avg_time')} />
        </div>
      </div>

      <div>
        <h2 className="mb-2.5 font-heading text-lg italic text-ink">{t('by_housekeeper')}</h2>
        <Card>
          {Object.keys(byHk).length === 0 ? (
            <span className="text-[13px] text-muted">{t('no_data')}</span>
          ) : (
            <div className="flex flex-col gap-2.5">
              {Object.entries(byHk).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-[13px] text-ink">{name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-sage" style={{ width: `${(count / maxHk) * 100}%` }} />
                  </div>
                  <span className="w-5 shrink-0 text-right text-[13px] text-muted">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-2.5 font-heading text-lg italic text-ink">{t('recent_completions')}</h2>
        <Card>
          {recent.length === 0 ? (
            <span className="text-[13px] text-muted">{t('no_data')}</span>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-[13px] text-ink">
                  <span>{t('room_detail')} {c.room} · {c.housekeeperName}</span>
                  <span className="text-muted">{c.durationSeconds ? formatDuration(c.durationSeconds) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
