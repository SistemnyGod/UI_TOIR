import type { PpeIssueDocumentSummaryDto } from "../../../../api/contracts";
import { formatRuDate } from "../documentDraft";
import { journalColumnNames, journalMoney, journalStatusName, type JournalColumn } from "./journalColumns";

export function JournalTable({ rows, columns, loading, detailLoading, onOpen }: {
  rows: PpeIssueDocumentSummaryDto[]; columns: JournalColumn[]; loading: boolean;
  detailLoading: boolean; onOpen: (id: string) => void;
}) {
  return <div className="ppe-journal-table" aria-busy={loading}>
    <table>
      <thead>
        <tr>
          <th>Сотрудник</th>{columns.map(column => <th key={column}>{journalColumnNames[column]}</th>)}<th>Действия</th>
        </tr>
      </thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>
          <button className="ppe-journal-name" disabled={detailLoading} onClick={() => onOpen(row.id)} type="button">{row.employeeName}</button>
          <small>Таб. № {row.personnelNo || "—"}</small>
        </td>
        {columns.map(column => <td data-label={journalColumnNames[column]} key={column}>{column === "department" ? row.department || "—"
          : column === "date" ? formatRuDate(row.documentDate)
            : column === "quantity" ? row.linesCount
              : column === "total" ? journalMoney(row.totalMinor)
                : <span className={`ppe-issue-badge ${row.hasOverdue ? "is-overdue" : row.status}`}>{row.hasOverdue ? "Есть просрочка" : journalStatusName(row.status)}</span>}</td>)}
        <td>
          <button className="button ghost" disabled={detailLoading} onClick={() => onOpen(row.id)} type="button">Открыть</button>
        </td>
      </tr>)}</tbody>
    </table>
    {!rows.length ? <div className="ppe-document-state">{loading ? "Загрузка документов…" : "Выдачи не найдены"}</div> : null}
  </div>;
}
