import type { ReactNode } from "react";

export type CompactTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
};

export function CompactTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "Нет данных",
  className = "",
}: {
  columns: CompactTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyText?: string;
  className?: string;
}) {
  return (
    <div className={`compact-table-wrap ${className}`}>
      <table className="compact-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ textAlign: column.align, width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="compact-table-empty" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} style={{ textAlign: column.align }}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
