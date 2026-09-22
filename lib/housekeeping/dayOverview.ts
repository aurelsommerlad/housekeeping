import { allowedProperties } from './rooms';
import { isPropertyManager, managedPropertyCodes } from './permissions';
import type { HousekeepingApp } from './useHousekeepingApp';
import type { ResolvedTask } from './tasks';
import type { CapacityEntry } from './types';

export interface DayOverview {
  date: string | null;
  visible: ResolvedTask[];
  cleaningTasks: ResolvedTask[];
  openManualTasks: ResolvedTask[];
  doneTasks: ResolvedTask[];
  isAdmin: boolean;
  isManagerHere: boolean;
  capacity: CapacityEntry[];
}

/** Desktop-Admin-Layout: aus TasksScreen.tsx ausgelagerte Ableitung (Punkt 17 "dieselben Tasks/
 * Filterzustaende/Permissions verwenden") - unveraendert dieselbe Logik/Definition wie zuvor
 * inline in TasksScreen (siehe dortige Kommentare zu Reinigungen/Aufgaben/Fertig), jetzt als EINE
 * gemeinsame, reine Funktion, die sowohl TasksScreen.tsx als auch die neue DesktopAdminSidebar.tsx
 * aufrufen - keine zweite/abweichende Berechnung, keine neue Datenquelle. */
export function dayOverviewFor(app: HousekeepingApp): DayOverview {
  const { state, tasksForDay, capacityFor } = app;
  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const managed = managedPropertyCodes(state.user, allowed);
  const isManagerHere = state.propertyScope === 'all' ? managed.length > 0 || isAdmin : isPropertyManager(state.user, state.propertyScope);

  const date = state.selectedDay || state.planningDays[0] || null;
  const visible = date ? tasksForDay(date) : [];
  const cleaningTasks = visible.filter((task) => task.type !== 'manual' && task.status !== 'completed');
  const openManualTasks = visible.filter((task) => task.type === 'manual' && task.status !== 'completed');
  const doneTasks = visible.filter((task) => task.status === 'completed');
  const capacity = date && isManagerHere ? capacityFor(date) : [];

  return { date, visible, cleaningTasks, openManualTasks, doneTasks, isAdmin, isManagerHere, capacity };
}
