import { useState } from "react";
import { X } from "lucide-react";
import type { ApplyInventoryPpeLineActionDto, InventoryPpeCardLineDto } from "../../../api/contracts";

export function PpeLineActionModal({ action, line, onClose, onSubmit }: { action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto; onClose: () => void; onSubmit: (payload: ApplyInventoryPpeLineActionDto) => Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [actNumber, setActNumber] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const labels = { defective: "Отметить неисправным", returned: "Оформить возврат", written_off: "Оформить списание" };

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        action,
        comment,
        occurredAt: new Date(`${date}T12:00:00`).toISOString(),
        quantity: action === "returned" ? Number(quantity.replace(",", ".")) : null,
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

  return <div className="ppe-v2-modal-backdrop" onMouseDown={onClose} role="presentation"><section className="ppe-v2-modal ppe-v2-action-modal" onMouseDown={(event) => event.stopPropagation()}><header className="ppe-v2-modal-head"><div><span className="ppe-v2-eyebrow">Операция по факту выдачи</span><h2>{labels[action]}</h2><p>{line.printItemName || line.itemName}</p></div><button aria-label="Закрыть" className="ppe-v2-icon-button" onClick={onClose} type="button"><X size={20} /></button></header><div className="ppe-v2-form-grid"><label>Дата операции<input onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>{action === "returned" ? <label>Количество возврата<input inputMode="decimal" max={line.quantity} onChange={(event) => setQuantity(event.target.value)} value={quantity} /></label> : null}{action === "written_off" ? <label>Номер акта<input onChange={(event) => setActNumber(event.target.value)} value={actNumber} /></label> : null}<label className="ppe-v2-field-wide">Комментарий<textarea onChange={(event) => setComment(event.target.value)} rows={3} value={comment} /></label></div>{error ? <p className="ppe-v2-error">{error}</p> : null}<footer className="ppe-v2-modal-actions"><button className="button" onClick={onClose} type="button">Отмена</button><button className="button primary" disabled={saving} onClick={() => void submit()} type="button">{saving ? "Сохранение…" : labels[action]}</button></footer></section></div>;
}
