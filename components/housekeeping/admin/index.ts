// Gemeinsames Layoutsystem fuer den gesamten Einstellungs-/Adminbereich - Owner-Center-
// Designsystem (https://github.com/aurelsommerlad/owner-center) auf Housekeeping uebertragen,
// siehe die einzelnen Komponenten fuer die jeweilige Quelle. Zentrale Importstelle, damit
// zukuenftige Settings-Unterseiten nicht jede Datei einzeln referenzieren muessen.
export { AdminPage } from './AdminPage';
export type { AdminBreadcrumb, AdminPageProps } from './AdminPage';
export { AdminSection } from './AdminSection';
export type { AdminSectionProps } from './AdminSection';
export { AdminField, AdminFieldGrid } from './AdminField';
export { AdminBadge } from './AdminBadge';
export type { AdminBadgeTone } from './AdminBadge';
export { AdminRow, AdminRowList } from './AdminRow';
export type { AdminRowProps } from './AdminRow';
export { AdminTable } from './AdminTable';
export type { AdminTableColumn } from './AdminTable';
export { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS, ADMIN_SELECT_CLASS } from './adminFormStyles';
