import { useState, type ReactNode } from "react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../../shared/ui";
import { useInventoryRepository } from "../../../../repositories/inventoryRepositoryContext";
import { useNormMutation } from "./useNormMutation";
import { decimalValue, monthsValue, type NormEditorSelection } from "./normEditorModel";
import "../../styles/ppe-norm-editor.css";

type Props = { selection: NormEditorSelection; canManage: boolean; onClose: () => void; onSaved: () => Promise<void>; onNotify: (message: string) => void };
export function NormEditorDialog(props: Props) {
  if (props.selection.kind === "scope") return <ScopeForm {...props} selection={props.selection} />;
  if (props.selection.kind === "rules") return <RulesForm {...props} selection={props.selection} />;
  if (props.selection.kind === "primary") return <PrimaryForm {...props} selection={props.selection} />;
  return <ApprovalForm {...props} selection={props.selection} />;
}
function EditorFrame({ title, subtitle, version, action, dirty, valid, mutation, children, canManage, onClose, onSaved, onNotify }: Omit<Props, "selection"> & {
  title: string; subtitle: string; version: number; action: string; dirty: boolean; valid: boolean; mutation: (owns: () => boolean) => Promise<unknown>; children: ReactNode;
}) {
  const operation = useNormMutation(title + ":" + subtitle, onSaved, onNotify);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: operation.saving, onClose });
  return <><ModalShell title={title} subtitle={subtitle} className="ppe-norm-editor-dialog" pending={operation.saving} onClose={requestClose}
    actions={<><Button variant="ghost" disabled={operation.saving} onClick={requestClose}>{canManage ? "Отмена" : "Закрыть"}</Button>{canManage ? <Button variant="primary" disabled={!valid} isLoading={operation.saving} onClick={() => { if (canManage && valid) void operation.run(mutation, "Изменения нормы сохранены", "Не удалось сохранить норму").then(saved => { if (saved) onClose(); }); }}>{action}</Button> : null}</>}>
    <p className="ppe-norm-editor-context">Версия при открытии: <strong>{version}</strong>. Сведения подтверждаются по нормативному источнику; автоматическое утверждение не выполняется.</p>
    <fieldset className="ppe-norm-editor-fields" disabled={!canManage || operation.saving} onChange={() => operation.setError("")}>{children}</fieldset>
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
  </ModalShell>{discardDialog}</>;
}
function ScopeForm({ selection, ...props }: Omit<Props, "selection"> & { selection: Extract<NormEditorSelection, { kind: "scope" }> }) {
  const { normSet } = selection, repository = useInventoryRepository();
  const [department, setDepartment] = useState(normSet.departmentName ?? ""), [aliases, setAliases] = useState((normSet.positionAliases ?? []).join("\n"));
  const [from, setFrom] = useState(normSet.effectiveFrom ?? ""), [to, setTo] = useState(normSet.effectiveTo ?? "");
  const positions = aliases.split("\n").map(value => value.trim()).filter(Boolean);
  const datesValid = Boolean(from && (!to || to >= from));
  const valid = Boolean(department.trim() && department.length <= 500 && positions.length && positions.length <= 100 && positions.every(value => value.length <= 500) && datesValid);
  const dirty = department !== (normSet.departmentName ?? "") || aliases !== (normSet.positionAliases ?? []).join("\n") || from !== (normSet.effectiveFrom ?? "") || to !== (normSet.effectiveTo ?? "");
  return <EditorFrame {...props} title="Область применения нормы" subtitle={normSet.positionName + " · " + normSet.versionName} version={normSet.version} action="Подтвердить область" dirty={dirty} valid={valid} mutation={() => repository.updatePpeNormSetScope(normSet.id, { expectedVersion: normSet.version, departmentName: department.trim(), positionAliases: positions, effectiveFrom: from || null, effectiveTo: to || null, updateDates: true })}>
    <label className="ppe-norm-editor-wide">Подразделение<input maxLength={500} required value={department} onChange={event => setDepartment(event.target.value)} /></label>
    <label className="ppe-norm-editor-wide">Применимые должности<textarea required value={aliases} onChange={event => setAliases(event.target.value)} rows={4} /><small>Каждая должность с новой строки. Используйте только подтверждённые наименования.</small></label>
    <label>Действует с<input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label><label>Действует до<input type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)} /><small>Пустое значение — срок окончания не задан.</small></label>
    {!datesValid ? <p className="field-error ppe-norm-editor-wide">Укажите начало действия; окончание не может быть раньше начала.</p> : null}
  </EditorFrame>;
}
function RulesForm({ selection, ...props }: Omit<Props, "selection"> & { selection: Extract<NormEditorSelection, { kind: "rules" }> }) {
  const { row, version } = selection, repository = useInventoryRepository();
  const [name, setName] = useState(row.normItemName), [quantity, setQuantity] = useState(String(row.quantity)), [unit, setUnit] = useState(row.unitSymbol ?? "");
  const [point, setPoint] = useState(row.normPoint ?? ""), [period, setPeriod] = useState(row.periodMonths?.toString() ?? ""), [life, setLife] = useState(row.lifeMonths?.toString() ?? "");
  const [previous, setPrevious] = useState(row.previousRequirementRowId ?? ""), [alternative, setAlternative] = useState(row.alternativeGroup ?? "");
  const count = decimalValue(quantity, 3, 999999999.999), periodMonths = monthsValue(period), lifeMonths = monthsValue(life);
  const previousValid = !previous.trim() || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous.trim());
  const valid = Boolean(name.trim() && unit.trim() && count !== null && periodMonths !== undefined && lifeMonths !== undefined && previousValid);
  const dirty = name !== row.normItemName || quantity !== String(row.quantity) || unit !== (row.unitSymbol ?? "") || point !== (row.normPoint ?? "") || period !== (row.periodMonths?.toString() ?? "") || life !== (row.lifeMonths?.toString() ?? "") || previous !== (row.previousRequirementRowId ?? "") || alternative !== (row.alternativeGroup ?? "");
  return <EditorFrame {...props} title="Правила строки нормы" subtitle={row.normItemName} version={version} action="Сохранить правила" dirty={dirty} valid={valid} mutation={() => repository.updatePpeNormRowRules(row.id, { expectedVersion: version, unitSymbol: unit.trim(), periodMonths: periodMonths ?? null, lifeMonths: lifeMonths ?? null, quantity: count, normPoint: point.trim(), normItemName: name.trim(), previousRequirementRowId: previous.trim() || null, alternativeGroup: alternative.trim() })}>
    <label className="ppe-norm-editor-wide">Наименование требования<textarea required maxLength={4000} rows={2} value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Количество по норме<input required inputMode="decimal" aria-invalid={count === null} value={quantity} onChange={event => setQuantity(event.target.value)} /><small>Положительное число, не более трёх знаков после запятой.</small></label><label>Единица<input required maxLength={40} value={unit} onChange={event => setUnit(event.target.value)} /></label>
    <label>Период, мес.<input inputMode="numeric" aria-invalid={periodMonths === undefined} value={period} onChange={event => setPeriod(event.target.value)} /></label><label>Срок носки, мес.<input inputMode="numeric" aria-invalid={lifeMonths === undefined} value={life} onChange={event => setLife(event.target.value)} /></label>
    <p className="ppe-norm-editor-hint ppe-norm-editor-wide">Сроки: целое число от 1 до 1200 либо пустое значение. Неизвестный срок не заполняется предположением.</p>
    <label className="ppe-norm-editor-wide">Пункт нормы<input maxLength={4000} value={point} onChange={event => setPoint(event.target.value)} /></label>
    <label>Группа альтернатив<input maxLength={120} value={alternative} onChange={event => setAlternative(event.target.value)} /></label><label>Предыдущее требование<input aria-invalid={!previousValid} value={previous} onChange={event => setPrevious(event.target.value)} /><small>Идентификатор требования из другой редакции; связь дополнительно проверит сервер.</small></label>
    {count === null || periodMonths === undefined || lifeMonths === undefined || !previousValid ? <p className="field-error ppe-norm-editor-wide">Проверьте количество, сроки и идентификатор предыдущего требования.</p> : null}
  </EditorFrame>;
}
function ApprovalForm({ selection, ...props }: Omit<Props, "selection"> & { selection: Extract<NormEditorSelection, { kind: "approval" | "primary" }> }) {
  const { mapping, row, version } = selection, repository = useInventoryRepository();
  const [evidence, setEvidence] = useState(mapping.approvalEvidence ?? ""), [factor, setFactor] = useState(String(mapping.normUnitsPerItem ?? 1));
  const count = decimalValue(factor, 6, 1000000), valid = Boolean(evidence.trim() && count !== null);
  const dirty = evidence !== (mapping.approvalEvidence ?? "") || factor !== String(mapping.normUnitsPerItem ?? 1);
  return <EditorFrame {...props} title="Утверждение товара для нормы" subtitle={row.normItemName} version={version} action="Подтвердить товар" dirty={dirty} valid={valid} mutation={() => repository.approvePpeNormMapping(row.id, { expectedNormVersion: version, itemId: mapping.itemId, normUnitsPerItem: count!, evidence: evidence.trim(), brandModelArticle: mapping.brandModelArticle, defaultUnitPriceMinor: mapping.defaultUnitPriceMinor })}>
    <div className="ppe-norm-editor-facts ppe-norm-editor-wide"><strong>{mapping.itemName}</strong><span>{mapping.itemSku || "Артикул не указан"} · {mapping.brandModelArticle || "Модель не указана"}</span><span>{mapping.isApproved ? "Соответствие уже утверждено" : "Сопоставлено, но не утверждено"}</span></div>
    <label>Коэффициент пересчёта<input required inputMode="decimal" aria-invalid={count === null} value={factor} onChange={event => setFactor(event.target.value)} /><small>Сколько единиц нормы приходится на одну единицу товара. До шести знаков после запятой.</small></label>
    <label className="ppe-norm-editor-wide">Основание проверки<textarea required maxLength={2000} rows={5} value={evidence} onChange={event => setEvidence(event.target.value)} /><small>Укажите подтверждающий документ и проверенные защитные свойства.</small></label>
    {count === null ? <p className="field-error ppe-norm-editor-wide">Коэффициент должен быть положительным и не превышать 1 000 000.</p> : null}
  </EditorFrame>;
}
function PrimaryForm({ selection, ...props }: Omit<Props, "selection"> & { selection: Extract<NormEditorSelection, { kind: "approval" | "primary" }> }) {
  const { mapping, row, version, normSetId } = selection, repository = useInventoryRepository();
  return <EditorFrame {...props} title="Сделать товар основным?" subtitle={row.normItemName} version={version} action="Сделать основным" dirty={false} valid mutation={async owns => {
    const current = await repository.getPpeNormSet(normSetId);
    if (!owns()) throw new Error("Сеанс изменился");
    const latest = current.rows.find(value => value.id === row.id)?.mappings.find(value => value.id === mapping.id);
    if (current.normSet.id !== normSetId || current.normSet.version !== version || !latest || latest.itemId !== mapping.itemId || latest.brandModelArticle !== mapping.brandModelArticle || latest.defaultUnitPriceMinor !== mapping.defaultUnitPriceMinor || latest.comment !== mapping.comment || latest.isApproved !== mapping.isApproved)
      throw new Error("Соответствие изменилось после открытия. Закройте окно и проверьте актуальный товар.");
    return repository.upsertPpeNormRowMapping(row.id, { itemId: mapping.itemId, isDefault: true, brandModelArticle: mapping.brandModelArticle, defaultUnitPriceMinor: mapping.defaultUnitPriceMinor, comment: mapping.comment });
  }}><div className="ppe-norm-editor-facts ppe-norm-editor-wide"><strong>{mapping.itemName}</strong><span>{mapping.itemSku || "Артикул не указан"} · {mapping.brandModelArticle || "Модель не указана"}</span></div><p className="ppe-norm-editor-hint ppe-norm-editor-wide">После выбора основного товара сервер снимет утверждение этого соответствия. Повторно проверьте и утвердите его перед использованием в выдаче. Модель, цена и комментарий сопоставления сохраняются.</p></EditorFrame>;
}
