import { useMemo, useState } from "react";
import type { ApplyInventoryPpeLineActionDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { PpeButton, PpeModalShell } from "./PpeUi";

export function PpeLineActionModal({ action, line, onClose, onSubmit }: { action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto; onClose: () => void; onSubmit: (payload: ApplyInventoryPpeLineActionDto) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [actNumber, setActNumber] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const labels = { defective: "Отметить неисправным", returned: "Оформить возврат", written_off: "Оформить списание" };
  const parsedQuantity = Number(quantity.replace(",", "."));
  const quantityInvalid = action === "returned" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > line.quantity);
  const futureDate = Boolean(date && date > today);
  const commentRequired = action === "written_off" || action === "defective";
  const canSubmit = Boolean(date && !futureDate && !quantityInvalid && (!commentRequired || comment.trim()));
  const closeModal = () => {
    if (!saving) onClose();
  };
  const operationHint = useMemo(() => ({
    defective: "Строка останется в истории с отметкой о неисправности. После этого её можно вернуть или списать.",
    returned: "Возврат завершает текущую выдачу. Можно вернуть часть количества — в истории сохранится фактически возвращённый объём.",
    written_off: "Списание завершает текущую выдачу. Укажите причину; номер акта можно добавить при наличии.",
  })[action], [action]);

  async function submit() {
    if (!date) {
      setError("Укажите дату операции");
      return;
    }
    if (futureDate) {
      setError("Дата операции не может быть в будущем");
      return;
    }
    if (quantityInvalid) {
      setError(`Количество возврата должно быть больше 0 и не более ${line.quantity}`);
      return;
    }
    if (commentRequired && !comment.trim()) {
      setError(action === "written_off" ? "Укажите причину списания" : "Опишите выявленную неисправность");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const occurredAt = new Date(`${date}T12:00:00`).toISOString();
      await onSubmit({
        action,
        comment: comment.trim(),
        occurredAt,
        quantity: action === "returned" ? parsedQuantity : null,
        writeOffActDate: action === "written_off" ? occurredAt : null,
        writeOffActNumber: action === "written_off" ? actNumber.trim() || null : null,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить операцию");
    } finally {
      setSaving(false);
    }
  }

  const confirmVariant = action === "written_off" || action === "defective" ? "danger" : "primary";

  return (
    <PpeModalShell
      ariaLabel={labels[action]}
      className={`ppe-v2-action-modal is-${action}`}
      closeDisabled={saving}
      description="Изменение будет записано в журнал СИЗ и изменит состояние фактической выдачи."
      eyebrow="Операция по факту выдачи"
      footer={(
        <>
          <PpeButton disabled={saving} onClick={closeModal} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!canSubmit} loading={saving} onClick={() => void submit()} variant={confirmVariant}>{labels[action]}</PpeButton>
        </>
      )}
      initialFocusSelector="[data-ppe-initial-focus]"
      onClose={closeModal}
      title={labels[action]}
    >
      <div className="ppe-v2-operation-summary">
        <div><small>СИЗ</small><strong>{line.printItemName || line.itemName}</strong>{line.printItemName && line.printItemName !== line.itemName ? <span>{line.itemName}</span> : null}</div>
        <div><small>Выдано</small><strong>{line.quantity} {line.unit}</strong><span>{line.issuedAt ? new Date(line.issuedAt).toLocaleDateString("ru-RU") : "Дата не указана"}</span></div>
      </div>
      <div className={`ppe-v2-operation-hint is-${action}`}><strong>{labels[action]}</strong><span>{operationHint}</span></div>
      <div className="ppe-v2-form-grid">
        <div className="ppe-v2-form-section-title ppe-v2-field-wide"><strong>Параметры операции</strong><span>Проверьте дату и заполните обязательные поля.</span></div>
        <label className={!date || futureDate ? "has-error" : ""}>Дата операции <em>*</em><input aria-invalid={!date || futureDate} data-ppe-initial-focus max={today} onChange={(event) => { setDate(event.target.value); setError(""); }} required type="date" value={date} /></label>
        {action === "returned" ? <label className={quantityInvalid ? "has-error" : ""}>Количество возврата <em>*</em><input aria-invalid={quantityInvalid} inputMode="decimal" max={line.quantity} min="0.01" onChange={(event) => { setQuantity(event.target.value); setError(""); }} required step="0.01" value={quantity} /><small>От 0,01 до {line.quantity} {line.unit}. Допускается частичный возврат.</small></label> : null}
        {action === "written_off" ? <label>Номер акта<input onChange={(event) => setActNumber(event.target.value)} placeholder="Если акт уже оформлен" value={actNumber} /></label> : null}
        <label className={`ppe-v2-field-wide ${commentRequired && !comment.trim() ? "has-error" : ""}`}>Причина / комментарий {commentRequired ? <em>*</em> : null}<textarea aria-invalid={commentRequired && !comment.trim()} onChange={(event) => { setComment(event.target.value); setError(""); }} placeholder={action === "written_off" ? "Причина списания или сведения об акте" : action === "defective" ? "Опишите неисправность или повреждение" : "Пояснение к возврату, если требуется"} required={commentRequired} rows={3} value={comment} /></label>
      </div>
      {futureDate ? <p className="ppe-v2-warning" role="alert">Дата находится в будущем. Выберите текущую или прошедшую дату.</p> : null}
      {error ? <p className="ppe-v2-error" role="alert">{error}</p> : null}
    </PpeModalShell>
  );
}
