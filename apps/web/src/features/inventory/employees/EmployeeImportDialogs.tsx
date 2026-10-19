import { useState } from "react";
import type { InventoryEmployeeImportPreviewDto, InventoryEmployeeImportResultDto } from "../../../api/contracts";
import { Button, ModalShell } from "../../../shared/ui";
import { useEmployeeDialogAction } from "./useEmployeeDialogAction";

const changeLabels: Record<string, string> = { create: "Создать", error: "Ошибка", update: "Обновить" };
function Summary({ values }: { values: [string, number][] }) {
  return <dl className="inventory-employees-import-summary inventory-employee-import-counts">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Errors({ errors }: { errors: string[] }) {
  return errors.length ? <details className="inventory-employee-import-errors"><summary>Ошибки: {errors.length}</summary><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details> : null;
}

export function ImportPreviewDialog({ busy, fileName, onCancel, onConfirm, preview }: {
  busy: boolean; fileName: string; onCancel: () => void; onConfirm: () => Promise<void | boolean>; preview: InventoryEmployeeImportPreviewDto;
}) {
  const action = useEmployeeDialogAction(busy);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(preview.rows.length / pageSize));
  return <ModalShell title="Предпросмотр импорта сотрудников" subtitle={fileName || "Файл сотрудников"} className="inventory-employee-dialog inventory-employee-import" pending={action.pending} onClose={onCancel}
    actions={<><Button disabled={action.pending} onClick={onCancel} variant="ghost">Отмена</Button><Button disabled={action.pending || preview.errors.length > 0} onClick={() => void action.run(onConfirm)} variant="primary">{action.pending ? "Импорт…" : "Импортировать"}</Button></>}>
    <Summary values={[["Строк", preview.rowsRead], ["Новые", preview.newRows], ["Обновления", preview.updateRows], ["Ошибки", preview.errors.length]]} />
    <details className="inventory-employee-import-references"><summary>Новые значения справочников</summary><dl>{[["Должности", preview.newPositions], ["Подразделения", preview.newDepartments], ["Группы", preview.newGroups]].map(([label, values]) => <div key={String(label)}><dt>{label}</dt><dd>{(values as string[]).join(", ") || "Нет"}</dd></div>)}</dl></details>
    <Errors errors={preview.errors} />
    {action.error ? <p role="alert" className="field-error">{action.error}</p> : null}
    <div className="inventory-employee-import-table-wrap"><table className="inventory-employee-import-table">
      <thead><tr>{["Строка", "Действие", "ФИО", "Табельный", "Должность", "Подразделение", "Группа", "Ошибка"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{preview.rows.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={`${row.rowNumber}-${row.fullName}`} className={row.error ? "is-error" : undefined}>
        <td data-label="Строка">{row.rowNumber}</td><td data-label="Действие"><span className={`inventory-employees-change ${row.changeType}`}>{changeLabels[row.changeType] ?? row.changeType}</span></td>
        <td data-label="ФИО">{row.fullName}</td><td data-label="Табельный">{row.personnelNo || "—"}</td><td data-label="Должность">{row.position || "—"}</td><td data-label="Подразделение">{row.department || "—"}</td><td data-label="Группа">{row.employeeGroup || "—"}</td><td data-label="Ошибка">{row.error || "—"}</td>
      </tr>)}</tbody>
    </table></div>
    <nav className="inventory-employee-import-pager" aria-label="Страницы предпросмотра импорта">
      <span>Показано {preview.rows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, preview.rows.length)} из {preview.rows.length}</span>
      <div><Button disabled={page <= 1} onClick={() => setPage(value => value - 1)} size="sm" variant="ghost">Назад</Button><span>{page} / {pageCount}</span><Button disabled={page >= pageCount} onClick={() => setPage(value => value + 1)} size="sm" variant="ghost">Вперед</Button></div>
    </nav>
  </ModalShell>;
}

export function ImportResultDialog({ onClose, result }: { onClose: () => void; result: InventoryEmployeeImportResultDto }) {
  return <ModalShell title="Результат импорта сотрудников" subtitle={`${result.rowsRead} строк обработано`} className="inventory-employee-dialog" onClose={onClose} actions={<Button onClick={onClose} variant="primary">Закрыть</Button>}>
    <Summary values={[["Добавлено", result.insertedRows], ["Обновлено", result.updatedRows], ["Пропущено", result.skippedRows], ["Ошибки", result.errors.length]]} />
    <Errors errors={result.errors} />
  </ModalShell>;
}

export function ConfirmDialog({ busy, confirmLabel, message, onCancel, onConfirm, title }: {
  busy: boolean; confirmLabel: string; message: string; onCancel: () => void; onConfirm: () => Promise<void | boolean>; title: string;
}) {
  const action = useEmployeeDialogAction(busy);
  return <ModalShell title={title} className="inventory-employee-dialog inventory-employee-confirm" onClose={onCancel} pending={action.pending}
    actions={<><Button disabled={action.pending} onClick={onCancel} variant="ghost">Отмена</Button><Button disabled={action.pending} onClick={() => void action.run(onConfirm)} variant="danger">{action.pending ? "Выполняем…" : confirmLabel}</Button></>}>
    <p>{message}</p>{action.error ? <p role="alert" className="field-error">{action.error}</p> : null}
  </ModalShell>;
}
