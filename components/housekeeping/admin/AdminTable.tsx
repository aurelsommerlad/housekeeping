import type { ReactNode } from 'react';

export interface AdminTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/**
 * Tabellarische Desktop-Ansicht (Owner-Center-Pattern `AdminTable.tsx`: Kopfzeile
 * `text-[11px] uppercase tracking-[0.06em]`, `divide-y divide-line`-Zeilen, `hover:bg-surface`) -
 * NUR ab `sm:` sichtbar. Darunter (mobil) zwingend eine kompakt gestapelte Zeilenliste statt
 * horizontalem Scrollen (Briefing "keine horizontal gequetschten Desktop-Layouts") - deshalb
 * anders als im Owner-Center-Original ein PFLICHT-`mobileRow`, keine erzwungene `min-width`-Tabelle
 * auf kleinen Displays.
 */
export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  mobileRow,
  emptyMessage = 'Keine Einträge vorhanden.',
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileRow: (row: T) => ReactNode;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-1 py-8 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              {columns.map((column) => (
                <th key={column.key} className={`px-3 py-2.5 font-medium ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="text-ink transition-colors hover:bg-surface">
                {columns.map((column) => (
                  <td key={column.key} className={`px-3 py-3 align-middle ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col divide-y divide-line sm:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="py-3 first:pt-0 last:pb-0">
            {mobileRow(row)}
          </div>
        ))}
      </div>
    </>
  );
}
