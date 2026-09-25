/**
 * Aggregations-Helfer fuer die Admin-Analyse "Wäsche" (Briefing "Wäschereklamation erfassen") -
 * reine, deterministische Funktionen ohne Seiteneffekte, damit sie unabhaengig vom UI-Rendering
 * testbar bleiben (siehe Testskript). Arbeiten ausschliesslich auf
 * bereits geladenen CleaningCompletionReport-Datensaetzen (api/linen-items.js#listReports) - keine
 * eigene Datenhaltung, keine zweite Aggregations-Engine parallel zur bestehenden Verbrauchslogik.
 *
 * Bewusst als eigenes, kleines Modul (statt direkt im Screen) gehalten, damit spaetere
 * Auswertungen (Monatsbericht, CSV/XLSX-Export, Reklamationsquote je Lieferant) dieselben
 * Bausteine wiederverwenden koennen, ohne die Aggregation ein zweites Mal zu schreiben.
 */
import { addDaysISO, todayISO } from './rooms';
import type { CleaningCompletionReport, LinenComplaintLine, LinenReportLine } from './types';

export interface LaundryDateRange {
  from: string;
  to: string;
}

/** "YYYY-MM-DD" im lokalen Kalendertag von `ms` - dieselbe Formatierung wie rooms.ts#todayISO,
 * hier nur fuer einen beliebigen Zeitstempel statt "jetzt". */
export function isoDateFromTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayRange(): LaundryDateRange {
  const today = todayISO();
  return { from: today, to: today };
}

export function yesterdayRange(): LaundryDateRange {
  const yesterday = addDaysISO(todayISO(), -1);
  return { from: yesterday, to: yesterday };
}

/** Montag bis Sonntag der aktuellen Woche (europaeische Wochenzaehlung, wie im Rest der App). */
export function thisWeekRange(): LaundryDateRange {
  const today = todayISO();
  const weekday = new Date(`${today}T00:00:00`).getDay(); // 0 = Sonntag
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const from = addDaysISO(today, offsetToMonday);
  return { from, to: addDaysISO(from, 6) };
}

export function thisMonthRange(): LaundryDateRange {
  const today = todayISO();
  const [year, month] = today.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export interface LaundryFilters extends LaundryDateRange {
  propertyId?: string | null;
  unitId?: string | null;
  teamId?: string | null;
}

export function filterLaundryReports(reports: CleaningCompletionReport[], filters: LaundryFilters): CleaningCompletionReport[] {
  return reports.filter((r) => {
    const day = isoDateFromTimestamp(r.completedAt);
    if (day < filters.from || day > filters.to) return false;
    if (filters.propertyId && r.propertyId !== filters.propertyId) return false;
    if (filters.unitId && r.unitId !== filters.unitId) return false;
    if (filters.teamId && r.housekeepingTeamId !== filters.teamId) return false;
    return true;
  });
}

export interface LaundryItemAggregate {
  itemId: string;
  itemName: string;
  unit: string;
  total: number;
}

function aggregateLines(lines: { itemId: string; itemName: string; unit: string; quantity: number }[]): LaundryItemAggregate[] {
  const byId = new Map<string, LaundryItemAggregate>();
  for (const line of lines) {
    const existing = byId.get(line.itemId);
    if (existing) {
      existing.total += line.quantity;
    } else {
      byId.set(line.itemId, { itemId: line.itemId, itemName: line.itemName, unit: line.unit, total: line.quantity });
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.total - a.total || a.itemName.localeCompare(b.itemName));
}

function linenLinesAsQuantityLines(lines: LinenReportLine[]): { itemId: string; itemName: string; unit: string; quantity: number }[] {
  return lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, quantity: l.actualQuantity }));
}

export interface LaundryPropertyAggregate {
  propertyId: string;
  consumption: number;
  complaints: number;
}

export interface LaundrySummary {
  cleaningsCount: number;
  totalConsumption: number;
  totalComplaints: number;
  consumptionByItem: LaundryItemAggregate[];
  complaintsByItem: LaundryItemAggregate[];
  byProperty: LaundryPropertyAggregate[];
}

/**
 * Aggregiert eine (bereits gefilterte) Report-Liste zu den fuer die Analyse-Ansicht benoetigten
 * Kennzahlen. `linenItems` (Verbrauch) und `laundryComplaints` (Reklamation) werden NIE
 * zusammengezaehlt - jede Summe/Tabelle bleibt strikt eine der beiden Kategorien (Briefing
 * "logisch UND numerisch getrennt").
 */
export function summarizeLaundryReports(reports: CleaningCompletionReport[]): LaundrySummary {
  const allConsumptionLines = reports.flatMap((r) => linenLinesAsQuantityLines(r.linenItems || []));
  const allComplaintLines = reports.flatMap((r) => (r.laundryComplaints || []) as LinenComplaintLine[]);

  const byPropertyMap = new Map<string, LaundryPropertyAggregate>();
  for (const r of reports) {
    const entry = byPropertyMap.get(r.propertyId) || { propertyId: r.propertyId, consumption: 0, complaints: 0 };
    entry.consumption += (r.linenItems || []).reduce((sum, l) => sum + l.actualQuantity, 0);
    entry.complaints += (r.laundryComplaints || []).reduce((sum, l) => sum + l.quantity, 0);
    byPropertyMap.set(r.propertyId, entry);
  }

  return {
    cleaningsCount: reports.length,
    totalConsumption: allConsumptionLines.reduce((sum, l) => sum + l.quantity, 0),
    totalComplaints: allComplaintLines.reduce((sum, l) => sum + l.quantity, 0),
    consumptionByItem: aggregateLines(allConsumptionLines),
    complaintsByItem: aggregateLines(allComplaintLines),
    byProperty: Array.from(byPropertyMap.values()).sort((a, b) => b.consumption - a.consumption),
  };
}

/**
 * Reklamationsquote je Wäscheart (Briefing "nur wenn Zähler/Nenner/Definition eindeutig sind") -
 * ausschliesslich Reklamationen GEGENUEBER dem Verbrauch DESSELBEN Artikels IM SELBEN
 * (gefilterten) Zeitraum, NIE gegenueber Einzelstuecken einer konkreten Reinigung (das laesst
 * sich aus den aggregierten Mengen nicht verlustfrei herleiten). `null`, wenn fuer diesen Artikel
 * im Zeitraum kein Verbrauch vorliegt (Division durch 0 waere irrefuehrend, nicht "0%").
 */
export function complaintRateForItem(consumptionByItem: LaundryItemAggregate[], complaintsByItem: LaundryItemAggregate[], itemId: string): number | null {
  const consumed = consumptionByItem.find((i) => i.itemId === itemId)?.total ?? 0;
  if (consumed <= 0) return null;
  const complained = complaintsByItem.find((i) => i.itemId === itemId)?.total ?? 0;
  return (complained / consumed) * 100;
}
