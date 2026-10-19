import { useState } from "react";
import type { InventoryPpeNormSetDto, InventoryPpeNormSetDetailDto, PpeKitTemplateDto, SavePpeKitTemplateLineDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { NormChangeDialog } from "./NormChangeDialog";
import { usePpeNormTransition } from "./usePpeNormTransition";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import { decimalValue } from "./norms/normEditorModel";
import "../styles/ppe-norm-editor.css";

type TemplateLine = Omit<SavePpeKitTemplateLineDto, "quantity"> & { quantityInput: string };
type Props = { template: PpeKitTemplateDto; norms: InventoryPpeNormSetDto[]; onClose: () => void; onBound: (template: PpeKitTemplateDto) => void };
export function LegacyTemplateDialog({ template, norms, onClose, onBound }: Props) {
  const repository = useInventoryRepository(), operation = usePpeDialogOperation();
  const [normId, setNormId] = useState(""), [detail, setDetail] = useState<InventoryPpeNormSetDetailDto | null>(null), [lines, setLines] = useState<TemplateLine[]>([]), [shared, setShared] = useState(false);
  const transition = usePpeNormTransition({ contextKey: template.id + ":" + template.version, normSetId: normId, enabled: Boolean(normId), canManage: true,
    lines: lines.map(line => ({ id: line.normRowId, normRowId: line.normRowId, itemName: line.itemName, unitSymbol: line.unitSymbol, quantity: line.quantityInput || "не задано" })),
    onCommit: (id, next, _mode, removeMissing) => { setNormId(id); setDetail(next); operation.setError(""); if (removeMissing) { const ids = new Set(next?.rows.filter(row => row.rowType === "item").map(row => row.id) ?? []); setLines(current => current.filter(line => ids.has(line.normRowId))); } },
  });
  const dirty = Boolean(normId || lines.length || shared), { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: operation.pending, onClose });
  const availableNorms = norms.filter(norm => norm.status !== "archived");
  const missingMapping = lines.some(line => !detail?.rows.some(row => row.id === line.normRowId && row.mappings.some(mapping => mapping.itemId === line.itemId)));
  const invalidLine = lines.find(line => decimalValue(line.quantityInput, 3, 999999999.999) === null || !line.unitSymbol.trim() || line.itemName.length > 500 || line.unitSymbol.length > 40 || line.lifeMonths !== null && (!Number.isInteger(line.lifeMonths) || line.lifeMonths <= 0 || line.lifeMonths > 1200) || line.unitPriceMinor !== null && (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0));
  const canBind = Boolean(normId && availableNorms.some(norm => norm.id === normId) && detail?.normSet.id === normId && lines.length && !invalidLine && !missingMapping && transition.ready && !transition.pending);
  function selectItem(normRowId: string, itemId: string) {
    const row = detail?.rows.find(row => row.id === normRowId), mapping = row?.mappings.find(mapping => mapping.itemId === itemId); operation.setError("");
    setLines(current => [...current.filter(line => line.normRowId !== normRowId), ...(row && mapping ? [{ normRowId, itemId, itemName: mapping.itemName, unitSymbol: mapping.itemUnitSymbol ?? "", quantityInput: mapping.normUnitsPerItem && mapping.normUnitsPerItem > 0 ? String(row.quantity / mapping.normUnitsPerItem) : "", lifeMonths: row.lifeMonths, unitPriceMinor: mapping.defaultUnitPriceMinor }] : [])]);
  }
  function bind() {
    if (!canBind) return;
    void operation.execute(async () => {
      const saved = await repository.bindLegacyPpeKitTemplate(template.id, { expectedVersion: template.version, normSetId: normId, isShared: shared, lines: lines.map(({ quantityInput, ...line }) => ({ ...line, quantity: decimalValue(quantityInput, 3, 999999999.999)! })) });
      if (saved.id !== template.id) throw new Error("Сервер вернул другой шаблон. Проверьте список перед повторным действием.");
      return saved;
    }, onBound);
  }
  return <><ModalShell title="Привязка наследованного шаблона" subtitle={template.name} className="ppe-legacy-template-dialog" pending={operation.pending} onClose={requestClose}
    actions={<><Button variant="ghost" disabled={operation.pending} onClick={requestClose}>Отмена</Button><Button variant="primary" isLoading={operation.pending} disabled={!canBind} onClick={bind}>Привязать шаблон</Button></>}>
    <p className="ppe-norm-editor-context">Проверьте исходный состав, выберите норму и явно укажите товары. Шаблон будет закреплён за вашим аккаунтом. Привязка не утверждает соответствия товаров и не создаёт выдачу.</p>
    <details className="ppe-legacy-source"><summary>Исходный состав · позиций: {template.lines.length}</summary>{template.lines.length ? <ul>{template.lines.map((line, index) => <li key={index}><strong>{line.itemName}</strong><span>{line.quantity} {line.unitSymbol}</span></li>)}</ul> : <p>В старом шаблоне состав не задан. Заполните его явно по достоверному источнику.</p>}</details>
    <fieldset className="ppe-norm-editor-fields" disabled={operation.pending}>
      <label className="ppe-norm-editor-wide">Нормативный набор<select value={transition.displayId} onChange={event => transition.select(event.target.value)}><option value="">Выберите набор</option>{normId && !availableNorms.some(norm => norm.id === normId) ? <option value={normId} disabled>Текущий выбор недоступен</option> : null}{availableNorms.map(norm => <option key={norm.id} value={norm.id}>{norm.departmentName} · {norm.positionName} · {norm.versionName}</option>)}</select></label>
      <label className="ppe-norm-editor-wide ppe-norm-editor-checkbox"><input type="checkbox" checked={shared} onChange={event => setShared(event.target.checked)} />Общий шаблон</label>
    </fieldset>
    {transition.loading ? <p role="status" className="ppe-norm-editor-hint">Загружаем состав выбранной нормы… Введённый комплект сохраняется до подтверждения.</p> : null}
    {transition.error ? <div className="field-error" role="alert">{transition.error}<Button disabled={operation.pending} onClick={transition.retry}>Повторить состав нормы</Button></div> : null}
    {transition.notice ? <p role="status" className="ppe-norm-editor-hint">{transition.notice}</p> : null}
    {normId && !availableNorms.some(norm => norm.id === normId) ? <p className="field-error" role="alert">Выбранный набор больше недоступен. Состав сохранён в форме; выберите действующий набор перед привязкой.</p> : null}
    <div className="ppe-legacy-lines" aria-label="Состав нового шаблона">
      {detail?.rows.filter(row => row.rowType === "item").map(row => { const selected = lines.find(line => line.normRowId === row.id); return <section key={row.id}><div className="ppe-legacy-line-title"><strong>{row.normItemName}</strong><span>{row.quantityText || row.quantity} · {row.issuePeriodText || "Срок не указан"}</span></div><label>Товар для требования<select aria-label={"Товар: " + row.normItemName} disabled={operation.pending || transition.pending} value={selected?.itemId ?? ""} onChange={event => selectItem(row.id, event.target.value)}><option value="">Не включать в шаблон</option>{row.mappings.map(mapping => <option key={mapping.id} value={mapping.itemId}>{mapping.itemName} · {mapping.isApproved ? "утверждено" : "не утверждено"}</option>)}</select></label>{selected ? <label>Количество<input aria-label={"Количество: " + row.normItemName} disabled={operation.pending || transition.pending} inputMode="decimal" aria-invalid={decimalValue(selected.quantityInput, 3, 999999999.999) === null} value={selected.quantityInput} onChange={event => { operation.setError(""); setLines(current => current.map(line => line.normRowId === row.id ? { ...line, quantityInput: event.target.value } : line)); }} /><small>{selected.unitSymbol || "Единица товара не задана"} · до трёх знаков после запятой</small></label> : null}</section>; })}
      {detail && !detail.rows.some(row => row.rowType === "item") ? <p className="ppe-norm-editor-hint">В наборе нет требований СИЗ. Выберите другой набор или подготовьте строки нормы.</p> : null}
    </div>
    {invalidLine || missingMapping ? <p className="field-error" role="alert">Проверьте количество, единицы, срок и соответствие выбранного товара норме. Некорректные значения сохранены в форме.</p> : null}
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
    <p className="ppe-norm-editor-hint">Выбрано позиций: {lines.length} · версия шаблона при открытии: {template.version}.</p>
  </ModalShell>{discardDialog}{transition.choice ? <NormChangeDialog choice={transition.choice} onConfirm={transition.accept} onClose={transition.decline} busy={operation.pending} /> : null}</>;
}
