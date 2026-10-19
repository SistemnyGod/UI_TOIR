import { useId } from "react";
import { formatPriceInput, parsePriceInput } from "./documentDraft";
import { addMonths, type DraftLine } from "./documentWorkflow";

export function LineFields({ line, disabled, onChange }: { line: DraftLine; disabled: boolean; onChange: (patch: Partial<DraftLine>) => void }) {
  const presetsId = useId(), errorId = useId();
  const value = line.priceInput ?? formatPriceInput(line.unitPriceMinor);
  const invalidPrice = parsePriceInput(value) === undefined;
  const due = addMonths(line.issueDate, line.lifeMonths);
  return <>
    <label>Пункт нормы<input maxLength={600} value={line.normPoint ?? ""} placeholder="Пункт и приложение" disabled={disabled} onChange={event => onChange({ normPoint: event.target.value })} /></label>
    <label>Дата выдачи<input type="date" value={line.issueDate} required disabled={disabled} onChange={event => onChange({ issueDate: event.target.value })} /></label>
    <label className="ppe-line-duration">Срок, мес.<input type="number" min={1} max={1200} step={1} list={presetsId} value={line.lifeMonths ?? ""} disabled={disabled} onChange={event => onChange({ lifeMonths: event.target.value ? Number(event.target.value) : null })} /><datalist id={presetsId}>{[1, 3, 6, 12, 18, 24, 36, 48].map(months => <option key={months} value={months} />)}</datalist><small>{due ? `До ${due.split("-").reverse().join(".")}` : "Срок не задан"}</small></label>
    <label>Количество<input type="number" min="0.001" step="0.001" required value={line.quantity} disabled={disabled} onChange={event => onChange({ quantity: Number(event.target.value) })} /></label>
    <label className="ppe-line-price">Цена, руб.<input inputMode="decimal" aria-label="Цена, руб." value={value} disabled={disabled} aria-invalid={invalidPrice || undefined} aria-describedby={invalidPrice ? errorId : undefined}
      onChange={event => { const raw = event.target.value, parsed = parsePriceInput(raw); onChange({ priceInput: raw, ...(parsed === undefined ? {} : { unitPriceMinor: parsed }) }); }}
      onBlur={() => { const parsed = parsePriceInput(value); if (parsed !== undefined) onChange({ unitPriceMinor: parsed, priceInput: undefined }); }}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />{invalidPrice ? <small id={errorId} className="field-error" role="alert">Укажите цену, например 1250,50</small> : null}</label>
    <label>Размер<input value={line.sizeText ?? ""} disabled={disabled} maxLength={120} onChange={event => onChange({ sizeText: event.target.value })} /></label>
  </>;
}
