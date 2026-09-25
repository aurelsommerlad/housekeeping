'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { CleaningCompletionReport } from '@/lib/housekeeping/types';
import { isAdmin, isLocationManager, managedPropertyCodes } from '@/lib/housekeeping/permissions';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { todayISO } from '@/lib/housekeeping/rooms';
import {
  complaintRateForItem, filterLaundryReports, isoDateFromTimestamp, summarizeLaundryReports,
  thisMonthRange, thisWeekRange, todayRange, yesterdayRange,
} from '@/lib/housekeeping/laundry';
import type { LaundryDateRange } from '@/lib/housekeeping/laundry';
import { AdminBadge, AdminSection, AdminTable, ADMIN_SELECT_CLASS } from './admin';
import { BottomSheet } from './BottomSheet';
import { cn } from '@/lib/cn';

export interface LaundryAnalyticsScreenProps {
  app: HousekeepingApp;
}

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Admin-Analyse "Wäsche" (Briefing "Wäschereklamation erfassen") - neue Datengrundlage
 * (api/linen-items.js#listReports), KEINE zweite Aggregations-Engine (siehe lib/housekeeping/
 * laundry.ts). Folgt bewusst dem NEUEREN AdminSection-Designsystem (siehe HousekeepingTeamsScreen.tsx/
 * ItemCatalogSettingsScreen.tsx), NICHT dem aelteren italic-Header-Stil von StatsScreen.tsx.
 * Admin sieht standortuebergreifend alle Berichte, ein Standortverantwortlicher ausschliesslich
 * die seiner eigenen zugeordneten Standorte (serverseitig bereits gefiltert, hier zusaetzlich das
 * Standort-Dropdown auf dieselbe Menge beschraenkt - Punkt "reuse existing property-scoped
 * pattern"). Verbrauch (VERBRAUCH) und Reklamation (REKLAMATIONEN) bleiben in jeder
 * Tabelle/Summe strikt getrennt.
 */
export function LaundryAnalyticsScreen({ app }: LaundryAnalyticsScreenProps) {
  const { state, t, loadLaundryReportsList } = app;
  const admin = isAdmin(state.user);
  const locationManager = isLocationManager(state.user);

  useEffect(() => {
    loadLaundryReportsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [preset, setPreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [propertyFilter, setPropertyFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [detailReportId, setDetailReportId] = useState<string | null>(null);

  const range: LaundryDateRange = useMemo(() => {
    if (preset === 'today') return todayRange();
    if (preset === 'yesterday') return yesterdayRange();
    if (preset === 'week') return thisWeekRange();
    if (preset === 'month') return thisMonthRange();
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const visibleProperties = admin
    ? state.properties
    : state.properties.filter((p) => managedPropertyCodes(state.user, state.properties.map((pp) => pp.code)).includes(p.code));

  // Standort+Datum bereits gefiltert, BEVOR das Apartment-Dropdown seine Optionen bildet (Punkt
  // "kombinierbare Filter") - so zeigt die Apartment-Liste nur tatsaechlich im aktuellen Kontext
  // vorkommende Einheiten, statt einer property-unabhaengigen Gesamtliste.
  const reportsForUnitOptions = useMemo(
    () => filterLaundryReports(state.laundryReports, { ...range, propertyId: propertyFilter || null }),
    [state.laundryReports, range, propertyFilter],
  );
  const unitOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of reportsForUnitOptions) {
      if (!seen.has(r.unitId)) seen.set(r.unitId, state.planningUnits.find((u) => u.id === r.unitId)?.name || r.unitId);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [reportsForUnitOptions, state.planningUnits]);

  const filteredReports = useMemo(
    () => filterLaundryReports(state.laundryReports, {
      ...range, propertyId: propertyFilter || null, unitId: unitFilter || null, teamId: teamFilter || null,
    }),
    [state.laundryReports, range, propertyFilter, unitFilter, teamFilter],
  );

  const summary = useMemo(() => summarizeLaundryReports(filteredReports), [filteredReports]);

  function propertyLabel(code: string): string {
    const prop = state.properties.find((p) => p.code === code);
    return prop ? getPropertyDisplayName(prop) : code;
  }
  function unitLabel(unitId: string): string {
    return state.planningUnits.find((u) => u.id === unitId)?.name || unitId;
  }
  function teamLabel(teamId: string | null): string | null {
    if (!teamId) return null;
    return state.teams.find((tm) => tm.id === teamId)?.name || null;
  }

  const reportsWithComplaints = useMemo(
    () => filteredReports.filter((r) => (r.laundryComplaints || []).length > 0).sort((a, b) => b.completedAt - a.completedAt),
    [filteredReports],
  );
  const complaintGroups = useMemo(() => {
    const byDay = new Map<string, CleaningCompletionReport[]>();
    for (const r of reportsWithComplaints) {
      const day = isoDateFromTimestamp(r.completedAt);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(r);
    }
    return Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [reportsWithComplaints]);

  const detailReport = detailReportId ? filteredReports.find((r) => r.id === detailReportId) || null : null;

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'today', label: t('laundry_date_today') },
    { id: 'yesterday', label: t('laundry_date_yesterday') },
    { id: 'week', label: t('laundry_date_week') },
    { id: 'month', label: t('laundry_date_month') },
    { id: 'custom', label: t('laundry_date_range') },
  ];

  if (!admin && !locationManager) {
    return <p className="px-4 py-10 text-center text-sm text-muted">{t('laundry_no_access')}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('nav_laundry')}</h1>
        <p className="mt-1 text-sm text-muted">
          {admin ? t('laundry_subtitle_admin') : t('laundry_subtitle_location_manager')}
        </p>
      </div>

      {/* Datumsnavigation - Schnellwahl-Pillen, dieselbe Chip-Optik wie die bestehenden
       * Standort-Pillen (HousekeepingTeamsScreen.tsx). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              preset === p.id ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={cn(ADMIN_SELECT_CLASS, 'w-auto')} />
          <span className="text-sm text-muted">–</span>
          <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className={cn(ADMIN_SELECT_CLASS, 'w-auto')} />
        </div>
      ) : null}

      {/* Kombinierbare Filter (Punkt "Standort/Apartment/Team") - unabhaengig voneinander
       * waehlbar, wirken gemeinsam mit der Datumsnavigation. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select value={propertyFilter} onChange={(e) => { setPropertyFilter(e.target.value); setUnitFilter(''); }} className={ADMIN_SELECT_CLASS}>
          <option value="">{t('laundry_filter_all_properties')}</option>
          {visibleProperties.map((p) => <option key={p.code} value={p.code}>{getPropertyDisplayName(p)}</option>)}
        </select>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className={ADMIN_SELECT_CLASS}>
          <option value="">{t('laundry_filter_all_units')}</option>
          {unitOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={ADMIN_SELECT_CLASS}>
          <option value="">{t('laundry_filter_all_teams')}</option>
          {state.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
      </div>

      {state.laundryReportsLoading && state.laundryReports.length === 0 ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : (
        <>
          {/* Kompakte Tageszusammenfassung */}
          <AdminSection>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {t('nav_laundry')} · {formatDayLabel(range.from)}{range.from !== range.to ? ` – ${formatDayLabel(range.to)}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <SummaryFigure value={summary.totalConsumption} label={t('laundry_summary_consumed')} />
                <SummaryFigure value={summary.totalComplaints} label={t('laundry_summary_complained')} />
                <SummaryFigure value={summary.cleaningsCount} label={t('laundry_summary_cleanings')} />
              </div>
            </div>
          </AdminSection>

          <AdminSection eyebrow={t('laundry_section_consumption')}>
            <AdminTable
              columns={[
                { key: 'item', header: t('laundry_table_item_header'), render: (r: typeof summary.consumptionByItem[number]) => r.itemName },
                { key: 'count', header: t('laundry_table_count_header'), render: (r) => `${r.total} ${r.unit}`, className: 'text-right' },
              ]}
              rows={summary.consumptionByItem}
              rowKey={(r) => r.itemId}
              mobileRow={(r) => (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{r.itemName}</span>
                  <span className="font-medium text-ink">{r.total} {r.unit}</span>
                </div>
              )}
              emptyMessage={t('laundry_consumption_empty')}
            />
            {summary.consumptionByItem.length > 0 ? (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm font-semibold text-ink">
                <span>{t('laundry_table_total_label')}</span>
                <span>{summary.totalConsumption}</span>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection eyebrow={t('laundry_section_complaints')}>
            <AdminTable
              columns={[
                { key: 'item', header: t('laundry_table_item_header'), render: (r: typeof summary.complaintsByItem[number]) => r.itemName },
                { key: 'count', header: t('laundry_table_count_header'), render: (r) => `${r.total} ${r.unit}`, className: 'text-right' },
                {
                  key: 'rate', header: t('laundry_table_rate_header'), className: 'text-right',
                  render: (r) => {
                    const rate = complaintRateForItem(summary.consumptionByItem, summary.complaintsByItem, r.itemId);
                    return rate === null ? '–' : `${rate.toFixed(1)}%`;
                  },
                },
              ]}
              rows={summary.complaintsByItem}
              rowKey={(r) => r.itemId}
              mobileRow={(r) => {
                const rate = complaintRateForItem(summary.consumptionByItem, summary.complaintsByItem, r.itemId);
                return (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{r.itemName}</span>
                    <span className="font-medium text-ink">{r.total} {r.unit}{rate !== null ? ` · ${rate.toFixed(1)}%` : ''}</span>
                  </div>
                );
              }}
              emptyMessage={t('laundry_complaints_empty')}
            />
            {summary.complaintsByItem.length > 0 ? (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm font-semibold text-ink">
                <span>{t('laundry_table_total_label')}</span>
                <span>{summary.totalComplaints}</span>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection eyebrow={t('laundry_property_table_title')}>
            <AdminTable
              columns={[
                { key: 'property', header: t('location_label'), render: (r: typeof summary.byProperty[number]) => propertyLabel(r.propertyId) },
                { key: 'consumption', header: t('laundry_property_table_consumption_header'), render: (r) => String(r.consumption), className: 'text-right' },
                { key: 'complaints', header: t('laundry_property_table_complaint_header'), render: (r) => String(r.complaints), className: 'text-right' },
              ]}
              rows={summary.byProperty}
              rowKey={(r) => r.propertyId}
              mobileRow={(r) => (
                <button
                  type="button"
                  onClick={() => setPropertyFilter(r.propertyId)}
                  className="flex w-full items-center justify-between text-left text-sm"
                >
                  <span className="text-ink">{propertyLabel(r.propertyId)}</span>
                  <span className="text-muted">{r.consumption} {t('laundry_consumed_short')} / {r.complaints} {t('laundry_complained_short')}</span>
                </button>
              )}
              emptyMessage={t('no_data')}
            />
          </AdminSection>

          <AdminSection eyebrow={t('laundry_complaints_list_title')}>
            {complaintGroups.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">{t('laundry_complaints_empty')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {complaintGroups.map(([day, reports]) => (
                  <div key={day}>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                      {day === todayISO() ? t('day_today') : formatDayLabel(day)}
                    </p>
                    <div className="flex flex-col divide-y divide-line">
                      {reports.map((r) => {
                        const count = (r.laundryComplaints || []).reduce((sum, l) => sum + l.quantity, 0);
                        const time = new Date(r.completedAt).toLocaleTimeString(state.lang, { hour: '2-digit', minute: '2-digit' });
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setDetailReportId(r.id)}
                            className="flex flex-col gap-1 py-3 text-left first:pt-0 last:pb-0 transition-colors hover:text-ink"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-ink">
                                {propertyLabel(r.propertyId)} · {unitLabel(r.unitId)}
                              </span>
                              <AdminBadge label={t('linen_complaint_status_summary', { n: count })} tone="strong" />
                            </div>
                            <p className="text-xs text-muted">
                              {time} · {t('laundry_cleaning_by_label', { name: r.completedByUserName })}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {(r.laundryComplaints || []).map((l) => `${l.quantity}× ${l.itemName}`).join(' · ')}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminSection>
        </>
      )}

      <BottomSheet open={!!detailReport} onClose={() => setDetailReportId(null)}>
        {detailReport ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-ink">{t('laundry_complaint_detail_title')}</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label={t('laundry_complaint_detail_property')} value={propertyLabel(detailReport.propertyId)} />
              <DetailField label={t('laundry_complaint_detail_apartment')} value={unitLabel(detailReport.unitId)} />
              <DetailField label={t('laundry_complaint_detail_date')} value={new Date(detailReport.completedAt).toLocaleString(state.lang)} />
              <DetailField label={t('laundry_complaint_detail_recorded_by')} value={detailReport.completedByUserName} />
              {teamLabel(detailReport.housekeepingTeamId) ? (
                <DetailField label={t('team_title')} value={teamLabel(detailReport.housekeepingTeamId) as string} />
              ) : null}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{t('laundry_complaint_detail_items')}</p>
              <div className="mt-1.5 flex flex-col divide-y divide-line">
                {(detailReport.laundryComplaints || []).map((line) => (
                  <div key={line.itemId} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                    <span className="text-ink">{line.itemName}</span>
                    <span className="font-medium text-ink">{line.quantity} {line.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <div />}
      </BottomSheet>
    </div>
  );
}

function SummaryFigure({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm text-ink">{value}</p>
    </div>
  );
}
