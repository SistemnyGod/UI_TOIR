import { useState } from "react";
import type { ApplyInventoryPpeLineActionDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import "../styles/ppe-line-action.css";

type Props = { action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto; onClose: () => void; onSubmit: (payload: ApplyInventoryPpeLineActionDto) => Promise<void> };
const labels = { defective: "Отметить неисправным", returned: "Оформить возврат", written_off: "Оформить списание" };
const hints = {
  defective: "Строка останется в истории с отметкой о неисправности. После этого её можно вернуть или списать.",
  returned: "Можно вернуть часть количества. В истории сохранится фактически возвращённый объём.",
  written_off: "Списание завершает текущую выдачу. Укажите причину; номер акта можно добавить при наличии.",
};
function localToday() { const now = new Date(); return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0"); }

export function PpeLineActionModal(props: Props) {
  return <LineActionEditor key={props.line.id + ":" + props.action} {...props} />;
}
function LineActionEditor({ action, line, onClose, onSubmit }: Props) {
  const today = localToday(), [initialDate] = useState(today);
  const [date, setDate] = useState(initialDate), [quantity, setQuantity] = useState(String(line.quantity));
  const [actNumber, setActNumber] = useState(""), [comment, setComment] = useState("");
  const operation = usePpeDialogOperation();
  const parsedQuantity = Number(quantity.replace(",", "."));
  const quantityInvalid = action === "returned" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > line.quantity);
  const futureDate = Boolean(date && date > today), commentRequired = action !== "returned";
  const canSubmit = Boolean(date && !futureDate && !quantityInvalid && (!commentRequired || comment.trim()));
  const dirty = date !== initialDate || quantity !== String(line.quantity) || Boolean(actNumber || comment);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: operation.pending, onClose });

  function submit() {
    if (!canSubmit) return;
    void operation.execute(async () => {
      const occurredAt = new Date(date + "T12:00:00").toISOString();
      await onSubmit({ action, occurredAt, comment: comment.trim(), quantity: action === "returned" ? parsedQuantity : null,
        writeOffActDate: action === "written_off" ? occurredAt : null, writeOffActNumber: action === "written_off" ? actNumber.trim() || null : null });
    }, onClose);
  }
  return <>
    <ModalShell title={labels[action]} subtitle="Операция будет сохранена в истории фактической выдачи СИЗ." className="ppe-line-action-dialog" pending={operation.pending} onClose={requestClose}
      actions={<><Button variant="ghost" disabled={operation.pending} onClick={requestClose}>Отмена</Button><Button variant={action === "returned" ? "primary" : "danger"} isLoading={operation.pending} disabled={!canSubmit} onClick={submit}>{labels[action]}</Button></>}>
      <dl className="ppe-line-action-summary"><div><dt>СИЗ</dt><dd>{line.printItemName || line.itemName}</dd>{line.printItemName && line.printItemName !== line.itemName ? <dd className="ppe-line-action-detail">{line.itemName}</dd> : null}</div><div><dt>Выдано</dt><dd>{line.quantity} {line.unit}</dd><dd className="ppe-line-action-detail">{line.issuedAt ? new Date(line.issuedAt).toLocaleDateString("ru-RU") : "Дата не указана"}</dd></div></dl>
      <p className="ppe-line-action-hint">{hints[action]}</p>
      <fieldset disabled={operation.pending} className="ppe-line-action-fields">
        <legend>Параметры операции</legend>
        <label>Дата операции <em>*</em><input aria-invalid={!date || futureDate} max={today} onChange={event => { setDate(event.target.value); operation.setError(""); }} required type="date" value={date} /></label>
        {action === "returned" ? <label>Количество возврата <em>*</em><input aria-invalid={quantityInvalid} inputMode="decimal" onChange={event => { setQuantity(event.target.value); operation.setError(""); }} required value={quantity} /><small>Больше 0 и не более {line.quantity} {line.unit}. Допускается частичный возврат.</small></label> : null}
        {action === "written_off" ? <label>Номер акта<input onChange={event => { setActNumber(event.target.value); operation.setError(""); }} placeholder="Если акт уже оформлен" value={actNumber} /></label> : null}
        <label className="ppe-line-action-wide">Причина / комментарий {commentRequired ? <em>*</em> : null}<textarea aria-invalid={commentRequired && !comment.trim()} onChange={event => { setComment(event.target.value); operation.setError(""); }} placeholder={action === "written_off" ? "Причина списания или сведения об акте" : action === "defective" ? "Опишите неисправность или повреждение" : "Пояснение к возврату, если требуется"} required={commentRequired} rows={3} value={comment} /></label>
      </fieldset>
      {futureDate ? <p className="field-error" role="alert">Дата находится в будущем. Выберите текущую или прошедшую дату.</p> : null}
      {quantityInvalid ? <p className="field-error" role="alert">Количество возврата должно быть больше 0 и не более {line.quantity} {line.unit}.</p> : null}
      {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
    </ModalShell>
    {discardDialog}
  </>;
}
