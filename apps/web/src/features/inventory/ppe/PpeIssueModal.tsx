import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import type { CreateInventoryPpeIssueDto, InventoryItemDto, InventoryPpeCardNormRowDto } from "../../../api/contracts";
import { PpeButton, PpeModalShell } from "./PpeUi";

export function PpeIssueModal({
  initialBrandModelArticle,
  initialQuantity,
  initialUnitPriceMinor,
  item,
  normRow,
  onChooseItem,
  onClose,
  onSubmit,
}: {
  initialBrandModelArticle?: string;
  initialQuantity?: number;
  initialUnitPriceMinor?: number | null;
  item: InventoryItemDto | null;
  normRow: InventoryPpeCardNormRowDto;
  onChooseItem: () => void;
  onClose: () => void;
  onSubmit: (payload: CreateInventoryPpeIssueDto) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [issuedAt, setIssuedAt] = useState(today);
  const [quantity, setQuantity] = useState(String(initialQuantity ?? (normRow.quantity || 1)));
  const [price, setPrice] = useState(
    initialUnitPriceMinor != null
      ? String(initialUnitPriceMinor / 100)
      : normRow.defaultUnitPriceMinor != null
        ? String(normRow.defaultUnitPriceMinor / 100)
        : "",
  );
  const [sizeText, setSizeText] = useState("");
  const [issueMethod, setIssueMethod] = useState<"personal" | "dispenser">("personal");
  const [model, setModel] = useState(initialBrandModelArticle ?? normRow.brandModelArticle);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    const inferredModel = [item.brandName, item.modelName, item.article].filter(Boolean).join(" · ");
    const nextPrice = initialUnitPriceMinor ?? item.defaultUnitPriceMinor;
    setModel(initialBrandModelArticle?.trim() || inferredModel);
    setPrice(nextPrice != null ? String(nextPrice / 100) : "");
    setQuantity(String(initialQuantity ?? (normRow.quantity || 1)));
    setSizeText("");
    setIssueMethod("personal");
    setComment("");
    setError("");
  }, [
    initialBrandModelArticle,
    initialQuantity,
    initialUnitPriceMinor,
    item?.article,
    item?.brandName,
    item?.defaultUnitPriceMinor,
    item?.id,
    item?.modelName,
    normRow.quantity,
  ]);

  const parsedQuantity = Number(quantity.replace(",", "."));
  const quantityInvalid = !Number.isFinite(parsedQuantity) || parsedQuantity <= 0;
  const parsedPrice = price.trim() ? Number(price.replace(",", ".")) : null;
  const priceInvalid = parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0);
  const dateInvalid = !issuedAt || issuedAt > today;
  const quantityDelta = quantityInvalid ? 0 : parsedQuantity - normRow.quantity;
  const canSubmit = Boolean(item) && !dateInvalid && !quantityInvalid && !priceInvalid;
  const closeModal = () => {
    if (!saving) onClose();
  };

  async function submit() {
    if (!item) return setError("Сначала выберите номенклатуру");
    if (!issuedAt) return setError("Укажите дату выдачи");
    if (issuedAt > today) return setError("Дата выдачи не может быть в будущем");
    if (quantityInvalid) return setError("Количество к выдаче должно быть больше нуля");
    if (priceInvalid) return setError("Цена должна быть корректным неотрицательным числом");
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
        unitPriceMinor: parsedPrice != null ? Math.round(parsedPrice * 100) : null,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось провести выдачу");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PpeModalShell
      ariaLabel="Выдать СИЗ"
      className="ppe-v2-issue-modal"
      closeDisabled={saving}
      description={normRow.normItemName}
      eyebrow="Факт выдачи"
      footer={(
        <>
          <PpeButton disabled={saving} onClick={closeModal} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!canSubmit} loading={saving} onClick={() => void submit()} variant="primary">
            {item ? "Подтвердить выдачу" : "Выберите СИЗ"}
          </PpeButton>
        </>
      )}
      initialFocusSelector="[data-ppe-initial-focus]"
      onClose={closeModal}
      title="Выдать СИЗ"
    >
      <div className="ppe-v2-norm-summary" aria-label="Параметры нормы">
        <span><small>Пункт норм</small><strong>{normRow.normPoint || "Не указан"}</strong></span>
        <span><small>Периодичность</small><strong>{normRow.issuePeriodText || "Не указана"}</strong></span>
        <span><small>Количество по норме</small><strong>{normRow.quantityText || normRow.quantity}</strong></span>
      </div>

      <button className={`ppe-v2-item-choice ${item ? "is-selected" : "is-required"}`} disabled={saving} onClick={onChooseItem} type="button">
        <span>
          <small>{item ? "Выбранная номенклатура" : "Требуется выбор"}</small>
          <strong>{item?.name ?? "Выберите допустимую позицию СИЗ"}</strong>
          {item ? <em>{[item.sku, item.article, item.unit].filter(Boolean).join(" · ")}</em> : null}
        </span>
        <span className="ppe-v2-choice-action">{item ? "Изменить" : "Выбрать"} <Link2 size={17} /></span>
      </button>

      <div className="ppe-v2-form-grid">
        <div className="ppe-v2-form-section-title ppe-v2-field-wide">
          <strong>Параметры фактической выдачи</strong>
          <span>Количество здесь относится только к этой операции и не изменяет норму.</span>
        </div>
        <label className={dateInvalid ? "has-error" : ""}>
          Дата выдачи *
          <input
            aria-invalid={dateInvalid}
            data-ppe-initial-focus
            max={today}
            onChange={(event) => { setIssuedAt(event.target.value); setError(""); }}
            required
            type="date"
            value={issuedAt}
          />
        </label>
        <label className={quantityInvalid ? "has-error" : ""}>
          Количество к выдаче *
          <input
            aria-invalid={quantityInvalid}
            inputMode="decimal"
            onChange={(event) => { setQuantity(event.target.value); setError(""); }}
            required
            value={quantity}
          />
          <small>По норме: {normRow.quantityText || normRow.quantity}</small>
        </label>
        <label>Единица<input disabled value={item?.unit || "шт."} /></label>
        <label className={priceInvalid ? "has-error" : ""}>
          Цена, ₽
          <input aria-invalid={priceInvalid} inputMode="decimal" onChange={(event) => { setPrice(event.target.value); setError(""); }} value={price} />
        </label>
        <label>Размер<input onChange={(event) => setSizeText(event.target.value)} placeholder="Например, 48–50" value={sizeText} /></label>
        <label>Способ выдачи<select onChange={(event) => setIssueMethod(event.target.value as "personal" | "dispenser")} value={issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></label>
        <div className="ppe-v2-form-section-title ppe-v2-field-wide">
          <strong>Данные для документа</strong>
          <span>Модель и цена подставляются из выбранной номенклатуры, но их можно уточнить.</span>
        </div>
        <label className="ppe-v2-field-wide">Модель / марка / артикул<input onChange={(event) => setModel(event.target.value)} value={model} /></label>
        <label className="ppe-v2-field-wide">Комментарий<textarea onChange={(event) => setComment(event.target.value)} rows={3} value={comment} /></label>
      </div>

      {!quantityInvalid && quantityDelta !== 0 ? (
        <p className="ppe-v2-issue-check is-warning" role="status">
          {quantityDelta > 0
            ? `Фактическая выдача превышает норму на ${quantityDelta}. Проверьте основание.`
            : `Фактическая выдача меньше нормы на ${Math.abs(quantityDelta)}.`}
        </p>
      ) : null}
      {issuedAt > today ? <p className="ppe-v2-error" role="alert">Дата выдачи не может быть в будущем.</p> : null}
      {error ? <p className="ppe-v2-error" role="alert">{error}</p> : null}
    </PpeModalShell>
  );
}
