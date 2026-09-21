/**
 * Einfache, nachvollziehbare Schaetzregel fuer Waescheverbrauch (Briefing Punkt 7: "zunaechst nur
 * eine einfache Architektur, keine komplexe Verbrauchs-Engine"). Nutzt AUSSCHLIESSLICH Daten, die
 * ueber die bestehende Task-/Reservierungs-Pipeline bereits zuverlaessig vorhanden sind
 * (TaskReservationSummary#adults/childrenCount, siehe tasks.ts#reservationSummary) - Bettenzahl/
 * Apartmenttyp wird bewusst NICHT verwendet, da dafuer aktuell keine zuverlaessige Datenquelle
 * existiert (kein Unit-Group-/Bettenkonfigurations-Fetch irgendwo in der App). Liefert `null`
 * ("Geschaetzt: -"), sobald die fuer eine Regel noetigen Daten fehlen - es wird nie ein Wert
 * erfunden.
 */
import type { LinenEstimationRule } from './types';
import type { ResolvedTask } from './tasks';

/** Bei Turnover ist die fuer den Waeschebedarf massgebliche Belegung die ANKOMMENDE Reservierung
 * (fuer die wird vorbereitet), sonst die aktuelle/abreisende - dieselbe Konvention wie
 * reservationInfo/nextReservationInfo ueberall sonst in der App (siehe tasks.ts). */
function relevantOccupancy(task: ResolvedTask): { adults: number | null; childrenCount: number } | null {
  const info = task.type === 'turnover' ? task.nextReservationInfo : task.reservationInfo;
  if (!info) return null;
  return { adults: info.adults, childrenCount: info.childrenCount };
}

export function estimateLinenQuantity(rule: LinenEstimationRule | undefined, task: ResolvedTask): number | null {
  if (!rule || rule.type === 'none') return null;

  if (rule.type === 'fixed') return rule.quantity;

  const occupancy = relevantOccupancy(task);
  if (!occupancy || occupancy.adults == null) return null;

  if (rule.type === 'perAdult') return Math.ceil(rule.multiplier * occupancy.adults);
  if (rule.type === 'perGuest') return Math.ceil(rule.multiplier * (occupancy.adults + occupancy.childrenCount));

  return null;
}
