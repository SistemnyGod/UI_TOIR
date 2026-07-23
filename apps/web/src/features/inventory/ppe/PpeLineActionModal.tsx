import { useState } from "react";
import type { ApplyInventoryPpeLineActionDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { PpeButton, PpeModalShell } from "./PpeUi";

export function PpeLineActionModal({ action, line, onClose, onSubmit }: { action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto; onClose: () => void; onSubmit: (payload: ApplyInventoryPpeLineActionDto) => Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [actNumber, setActNumber] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const labels = { defective: "Отметить неисправным", returned: "Оформить возврат", written_off: "Оформить списание" };

  async function submit() {
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (action === "returned" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > line.quantity)) {
      setError("Количество возврата должно быть от 0 до " + line.quantity);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        action,
        comment,
        occurredAt: new Date(`${date}T12:00:00`).toISOString(),
        quantity: action === "returned" ? parsedQuantity : null,
        writeOffActDate: action === "written_off" ? new Date(`${date}T12:00:00`).toISOString() : null,
        writeOffActNumber: action === "written_off" ? actNumber : null,
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
      className="ppe-v2-action-modal"
      description="Изменение будет записано в журнал СИЗ."
      eyebrow="Операция по факту выдачи"
      footer={(
        <>
          <PpeButton onClick={onClose} variant="ghost">Отмена</PpeButton>
          <PpeButton loading={saving} onClick={() => void submit()} variant={confirmVariant}>{labels[action]}</PpeButton>
        </>
      )}
      initialFocusSelector="[data-ppe-initial-focus]"
      onClose={onClose}
      title={labels[action]}
    >
      <div className="ppe-v2-operation-summary">
        <div><small>СИЗ</small><strong>{line.printItemName || line.itemName}</strong><span>{line.itemName}</span></div>
        <div><small>Выдано</small><strong>{line.quantity} {line.unit}</strong><span>{line.issuedAt ? new Date(line.issuedAt).toLocaleDateString("ru-RU") : "Дата не указана"}</span></div>
      </div>
      <div className="ppe-v2-form-grid">
        <div className="ppe-v2-form-section-title ppe-v2-field-wide"><strong>Параметры операции</strong><span>Проверьте дату и заполните основание.</span></div>
        <label>Дата операции<input data-ppe-initial-focus max="2999-12-31" onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
        {action === "returned" ? <label>Количество возврата<input inputMode="decimal" max={line.quantity} min="0" onChange={(event) => setQuantity(event.target.value)} value={quantity} /></label> : null}
        {action === "written_off" ? <label>Номер акта<input onChange={(event) => setActNumber(event.target.value)} placeholder="Необязательно" value={actNumber} /></label> : null}
        <label className="ppe-v2-field-wide">Комментарий<textarea onChange={(event) => setComment(event.target.value)} placeholder="Причина или пояснение к операции" rows={3} value={comment} /></label>
      </div>
      {date > new Date().toISOString().slice(0, 10) ? <p className="ppe-v2-warning">Дата находится в будущем. Проверьте дату операции.</p> : null}
      {error ? <p className="ppe-v2-error" role="alert">{error}</p> : null}
    </PpeModalShell>
  );
}
