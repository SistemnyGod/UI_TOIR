import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import type { CreateInventoryPpeIssueDto, InventoryItemDto, InventoryPpeCardNormRowDto } from "../../../api/contracts";

export function PpeIssueModal({
  item,
  normRow,
  onChooseItem,
  onClose,
  onSubmit,
}: {
  item: InventoryItemDto | null;
  normRow: InventoryPpeCardNormRowDto;
  onChooseItem: () => void;
  onClose: () => void;
  onSubmit: (payload: CreateInventoryPpeIssueDto) => Promise<void>;
}) {
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(String(normRow.quantity || 1));
  const [price, setPrice] = useState(normRow.defaultUnitPriceMinor ? String(normRow.defaultUnitPriceMinor / 100) : "");
  const [sizeText, setSizeText] = useState("");
  const [issueMethod, setIssueMethod] = useState<"personal" | "dispenser">("personal");
  const [model, setModel] = useState(normRow.brandModelArticle);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (item && !model) setModel([item.brandName, item.modelName, item.article].filter(Boolean).join(" · "));
  }, [item, model]);

  async function submit() {
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!item) return setError("Сначала выберите номенклатуру");
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return setError("Количество должно быть больше нуля");
    if (price.trim() && (!Number.isFinite(Number(price.replace(",", "."))) || Number(price.replace(",", ".")) < 0)) return setError("Цена должна быть корректным неотрицательным числом");
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        brandModelArticle: model.trim(),
        cardNormRowId: normRow.id,
        comment: comment.trim(),
        issueMethod,
        issuedAt: new Date(`${issuedAt}T12:00:00`).toISOString(),
        itemId: item.id,
        quantity: parsedQuantity,
        sizeText: sizeText.trim(),
        unitPriceMinor: price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : null,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось провести выдачу");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ppe-v2-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-label="Выдать СИЗ" className="ppe-v2-modal ppe-v2-issue-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ppe-v2-modal-head">
          <div><span className="ppe-v2-eyebrow">Факт выдачи</span><h2>Выдать СИЗ</h2><p>{normRow.normItemName}</p></div>
          <button aria-label="Закрыть" className="ppe-v2-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <div className="ppe-v2-modal-body">
        <div className="ppe-v2-norm-summary">
          <span><small>Пункт норм</small><strong>{normRow.normPoint || "Не указан"}</strong></span>
          <span><small>Периодичность</small><strong>{normRow.issuePeriodText || "Не указана"}</strong></span>
          <span><small>Количество по норме</small><strong>{normRow.quantityText || normRow.quantity}</strong></span>
        </div>
        <button className={"ppe-v2-item-choice " + (item ? "is-selected" : "is-required")} onClick={onChooseItem} type="button">
          <span><small>{item ? "Выбрано по норме" : "Требуется выбор"}</small><strong>{item?.name ?? "Выберите допустимую позицию СИЗ"}</strong>{item ? <em>{[item.sku, item.article, item.unit].filter(Boolean).join(" · ")}</em> : null}</span><span className="ppe-v2-choice-action">{item ? "Изменить" : "Выбрать"} <Link2 size={17} /></span>
        </button>
        <div className="ppe-v2-form-grid">
          <div className="ppe-v2-form-section-title ppe-v2-field-wide"><strong>Параметры выдачи</strong><span>Дата, количество, размер и способ получения.</span></div>
          <label>Дата выдачи<input max="2999-12-31" onChange={(event) => setIssuedAt(event.target.value)} type="date" value={issuedAt} /></label>
          <label>Количество<input inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} value={quantity} /></label>
          <label>Единица<input disabled value={item?.unit || "шт."} /></label>
          <label>Цена, ₽<input inputMode="decimal" onChange={(event) => setPrice(event.target.value)} value={price} /></label>
          <label>Размер<input onChange={(event) => setSizeText(event.target.value)} placeholder="Например, 48–50" value={sizeText} /></label>
          <label>Способ выдачи<select onChange={(event) => setIssueMethod(event.target.value as "personal" | "dispenser")} value={issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></label>
          <div className="ppe-v2-form-section-title ppe-v2-field-wide"><strong>Данные для документа</strong><span>При необходимости уточните модель и оставьте комментарий.</span></div>
          <label className="ppe-v2-field-wide">Модель / марка / артикул<input onChange={(event) => setModel(event.target.value)} value={model} /></label>
          <label className="ppe-v2-field-wide">Комментарий<textarea onChange={(event) => setComment(event.target.value)} rows={3} value={comment} /></label>
        </div>
        {issuedAt > new Date().toISOString().slice(0, 10) ? <p className="ppe-v2-warning">Дата находится в будущем. Сохранение разрешено, проверьте дату.</p> : null}
        {error ? <p className="ppe-v2-error">{error}</p> : null}
        </div>
        <footer className="ppe-v2-modal-actions"><button className="button" onClick={onClose} type="button">Отмена</button><button className="button primary" disabled={saving || !item} onClick={() => void submit()} type="button">{saving ? "Сохранение…" : item ? "Подтвердить выдачу" : "Выберите СИЗ"}</button></footer>
      </section>
    </div>
  );
}
