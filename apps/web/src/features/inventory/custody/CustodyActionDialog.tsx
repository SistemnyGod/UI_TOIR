import { useId, useState } from "react";
import type { InventoryCustodyRecordDto, InventoryEmployeeDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { formatQuantity, recordStatusLabel } from "./custodyCommon";
import { useCustodyCommand } from "./useCustodyCommand";

export type CustodyRecordAction = {
  commentLabel: string; commentRequired?: boolean; confirmLabel: string; documentId?: string;
  kind?: "status" | "transfer" | "archive"; row: InventoryCustodyRecordDto;
  status: "in_use" | "returned" | "written_off" | "lost" | "archived"; title: string;
};
export function CustodyActionDialog({ action, employees, onClose, onSubmit, busy = false }: {
  action: CustodyRecordAction; employees: InventoryEmployeeDto[]; onClose: () => void;
  onSubmit: (employeeId: string, comment: string) => Promise<void | boolean>; busy?: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(""), [comment, setComment] = useState("");
  const command = useCustodyCommand(onClose), formId = useId(), pending = command.pending || busy;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: Boolean(employeeId || comment), pending, onClose });
  const candidates = employees.filter(employee => employee.status !== "archived" && employee.fullName !== action.row.employeeName);
  function submit() {
    if (pending) return;
    if (action.kind === "transfer" && !candidates.some(employee => employee.id === employeeId)) { command.setError("Выберите доступного нового сотрудника."); return; }
    if (action.commentRequired && !comment.trim()) { command.setError("Укажите причину или комментарий."); return; }
    void command.run(() => onSubmit(employeeId, comment));
  }
  return <><ModalShell title={action.title} subtitle="Операция под запись" className="custody-action-dialog" onClose={requestClose} pending={pending}
    actions={<><Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button><Button disabled={pending} form={formId} type="submit" variant={action.kind === "archive" || action.status === "written_off" ? "danger" : "primary"}>{pending ? "Выполняем…" : action.confirmLabel}</Button></>}>
    <dl className="custody-action-summary">{[["Сотрудник", action.row.employeeName || "Не указан"], ["Предмет", action.row.itemName], ["Количество", `${formatQuantity(action.row.quantity)} ${action.row.unit || ""}`], ["Текущий статус", recordStatusLabel(action.row.status)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <form id={formId} onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={pending}>
      {action.kind === "transfer" ? <label>Новый сотрудник<select aria-label="Новый сотрудник" autoFocus value={employeeId} onChange={event => { setEmployeeId(event.target.value); command.setError(""); }} required>
        <option value="">Выберите сотрудника</option>{employeeId && !candidates.some(employee => employee.id === employeeId) ? <option value={employeeId} disabled>Выбранный сотрудник больше недоступен</option> : null}
        {candidates.map(employee => <option value={employee.id} key={employee.id}>{[employee.fullName, employee.personnelNo].filter(Boolean).join(" · ")}</option>)}
      </select></label> : null}
      {action.kind === "archive" ? <p>Запись будет перенесена в архив. История операций сохранится.</p> : <label>{action.commentLabel}<textarea autoFocus={action.kind !== "transfer"} required={action.commentRequired} value={comment} onChange={event => { setComment(event.target.value); command.setError(""); }} placeholder="Комментарий попадёт в историю движения" rows={4} /></label>}
    </fieldset></form>
    {command.error ? <p role="alert" className="field-error">{command.error}</p> : null}
  </ModalShell>{discardDialog}</>;
}
