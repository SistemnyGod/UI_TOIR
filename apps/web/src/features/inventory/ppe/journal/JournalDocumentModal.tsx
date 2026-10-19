import { useMemo } from "react";
import type { PpeIssueDocumentDto } from "../../../../api/contracts";
import { ModalShell } from "../../../../shared/ui/ModalShell";
import { addMonths } from "../documentWorkflow";
import { formatRuDate } from "../documentDraft";
import { journalMoney } from "./journalColumns";

export function JournalDocumentModal({ document, canManage, onClose, onHistory, onOpen }: {
  document: PpeIssueDocumentDto; canManage: boolean; onClose: () => void; onHistory: () => void; onOpen: () => void;
}) {
  const lifeMonths = useMemo(() => new Map(document.content.normRows.map(row => [row.id, row.lifeMonths])), [document.content.normRows]);
  const title = document.status === "draft" ? "Готовится к выдаче" : document.status === "confirmed" ? "Выдано сотруднику" : "Документ отменён";
  return <ModalShell title={title}
    subtitle={`${document.content.employee.fullName} · Таб. № ${document.content.employee.personnelNo} · ${formatRuDate(document.content.documentDate)}`}
    className="ppe-ref-modal" onClose={onClose}
    actions={<>
      <button className="button secondary" onClick={onHistory} type="button">История сотрудника</button>
      <button className="button primary" onClick={onOpen} type="button">{document.status === "draft" && canManage ? "Продолжить выдачу" : "Открыть документы"}</button>
    </>}>
    <div className="ppe-journal-table">
      <table>
        <thead>
          <tr>{["СИЗ / Номенклатура", "Дата выдачи", "Срок / до", "Количество", "Стоимость"].map(label => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>{document.content.lines.map(line => {
          const due = addMonths(line.issueDate, line.lifeMonths ?? lifeMonths.get(line.normRowId));
          return <tr key={line.id}>
            <td>{line.itemName}<small>{line.brandModelArticle}</small>
            </td>
            <td data-label="Дата выдачи">{formatRuDate(line.issueDate)}</td>
            <td data-label="Срок / до">{due ? formatRuDate(due) : "Не указан"}</td>
            <td data-label="Количество">{line.quantity} {line.unitSymbol}</td>
            <td data-label="Стоимость">{line.totalMinor === null ? "Не указана" : journalMoney(line.totalMinor)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </ModalShell>;
}
