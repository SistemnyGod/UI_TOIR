import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

export type CompactTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
  /** Keeps a utility column visible while the table itself scrolls horizontally. */
  sticky?: "left" | "right";
};

export function CompactTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = "Нет данных",
  loading = false,
  error,
  className = "",
  getRowClassName,
  onRowContextMenu,
  onRowClick,
  onRowDoubleClick,
}: {
  columns: CompactTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyText?: string;
  loading?: boolean;
  error?: string;
  className?: string;
  getRowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  onRowContextMenu?: (event: ReactMouseEvent<HTMLTableRowElement>, row: T) => void;
  onRowDoubleClick?: (row: T) => void;
}) {
  return (
    <div aria-busy={loading} className={`compact-table-wrap ${className}`}>
      <table className="compact-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.sticky ? `compact-table-cell-sticky-${column.sticky}` : undefined} key={column.key} style={{ textAlign: column.align, width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="compact-table-state" colSpan={columns.length}>
                Загрузка…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td aria-live="assertive" className="compact-table-state compact-table-state-error" colSpan={columns.length}>
                {error}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="compact-table-empty" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                className={getRowClassName?.(row)}
                key={getRowKey(row)}
                onClick={onRowClick ? (event) => {
                  if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
                  onRowClick(row);
                } : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                onContextMenu={onRowContextMenu ? (event) => onRowContextMenu(event, row) : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td className={column.sticky ? `compact-table-cell-sticky-${column.sticky}` : undefined} key={column.key} style={{ textAlign: column.align }}>
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
