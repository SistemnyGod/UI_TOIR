import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FileText,
  Layers3,
  PackageSearch,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemSetDetailDto,
  InventoryPpeCardNormRowDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import type { PpeEmployeeCardDetails, PrintData, PrintMode } from "./ppeTypes";
import type { PpeIssueDraftLine, PpeIssueLineProblem } from "./ppeIssueDraft";
import { PpeButton } from "./PpeUi";
import { validateIssueDraftLine } from "./ppeIssueDraft";
import { PrintPaper } from "./ppePrint";

export type DraftSource = "active_norms" | "previous_card" | "empty";
export type SelectionTab = "norms" | "catalog" | "sets";
export type IssueType = "primary" | "planned" | "replacement" | "additional";

export function EmployeeDocumentStep({
  basis,
  details,
  draftExists,
  employee,
  employees,
  employeeId,
  issueDate,
  issueType,
  loading,
  onBasisChange,
  onDetailsChange,
  onEmployeeChange,
  onIssueDateChange,
  onIssueTypeChange,
  onQueryChange,
  query,
  responsible,
  onResponsibleChange,
  source,
  sourceReady,
  onSourceChange,
  onContinue,
  saving,
}: {
  basis: string;
  details: PpeEmployeeCardDetails;
  draftExists: boolean;
  employee: InventoryEmployeeDto | null;
  employees: InventoryEmployeeDto[];
  employeeId: string;
  issueDate: string;
  issueType: IssueType;
  loading: boolean;
  onBasisChange: (value: string) => void;
  onDetailsChange: (field: keyof PpeEmployeeCardDetails, value: string) => void;
  onEmployeeChange: (value: string) => void;
  onIssueDateChange: (value: string) => void;
  onIssueTypeChange: (value: IssueType) => void;
  onQueryChange: (value: string) => void;
  query: string;
  responsible: string;
  onResponsibleChange: (value: string) => void;
  source: DraftSource;
  sourceReady: boolean;
  onSourceChange: (value: DraftSource) => void;
  onContinue: () => void;
  saving: boolean;
}) {
  const filtered = employees.filter((item) => [item.fullName, item.personnelNo, item.position, item.department]
    .join(" ").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const ready = Boolean(employeeId && issueDate && responsible.trim() && basis.trim());
  return (
    <div className="ppe-issue-step-grid">
      <section className="ppe-issue-card ppe-issue-employee-card">
        <CardHeading icon={<UserRound size={22} />} kicker="Шаг 1" title="Сотрудник и документ" text="Выберите владельца карточки и параметры конкретной выдачи." />
        <label className="ppe-issue-field-wide"><span>Поиск сотрудника</span><div className="ppe-issue-search"><Search size={17} /><input disabled={draftExists} onChange={(event) => onQueryChange(event.target.value)} placeholder="ФИО, табельный номер или должность" value={query} /></div></label>
        <label className="ppe-issue-field-wide"><span>Сотрудник</span><select disabled={loading || draftExists} onChange={(event) => onEmployeeChange(event.target.value)} value={employeeId}><option value="">Выберите сотрудника</option>{filtered.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.personnelNo}</option>)}</select></label>
        {employee ? <div className="ppe-issue-employee-summary"><span className="ppe-issue-avatar">{initials(employee.fullName)}</span><div><strong>{employee.fullName}</strong><small>{employee.position} · {employee.department}</small><small>Табельный номер: {employee.personnelNo}</small></div><span className="ppe-issue-ready"><CheckCircle2 size={15} /> Выбран</span></div> : <div className="ppe-issue-empty-inline"><UserRound size={18} /> Сотрудник ещё не выбран</div>}
        <div className="ppe-issue-subheading"><strong>Характеристики для печатной карточки</strong><span>Размеры хранятся в карточке сотрудника, но не показываются в таблицах выдачи.</span></div>
        <div className="ppe-issue-detail-grid">{(["gender", "height", "clothingSize", "shoeSize", "headSize", "respiratorSize", "handProtectionSize"] as Array<keyof PpeEmployeeCardDetails>).map((field) => <label key={field}><span>{detailLabel(field)}</span><input onChange={(event) => onDetailsChange(field, event.target.value)} placeholder={detailPlaceholder(field)} value={details[field] ?? ""} /></label>)}</div>
      </section>
      <aside className="ppe-issue-side-stack">
        <section className="ppe-issue-card">
          <CardHeading icon={<FileText size={22} />} kicker="Документ" title="Параметры выдачи" />
          <div className="ppe-issue-form-grid">
            <label><span>Дата выдачи *</span><div className="ppe-issue-input-icon"><CalendarDays size={15} /><input onChange={(event) => onIssueDateChange(event.target.value)} required type="date" value={issueDate} /></div></label>
            <label><span>Вид выдачи *</span><select onChange={(event) => onIssueTypeChange(event.target.value as IssueType)} value={issueType}><option value="primary">Первичная</option><option value="planned">Плановая</option><option value="replacement">Замена</option><option value="additional">Дополнительная</option></select></label>
            <label><span>Ответственный *</span><input onChange={(event) => onResponsibleChange(event.target.value)} placeholder="ФИО ответственного" required value={responsible} /></label>
            <label><span>Основание *</span><input onChange={(event) => onBasisChange(event.target.value)} placeholder="Приказ или документ" required value={basis} /></label>
          </div>
        </section>
        <section className="ppe-issue-card ppe-issue-source-card">
          <CardHeading icon={<ShieldCheck size={22} />} kicker="Источник" title="Нормы сотрудника" />
          <div className="ppe-issue-source-options">
            <SourceOption active={source === "active_norms"} disabled={draftExists || !sourceReady} label="Действующие нормы" text={sourceReady ? "Рекомендуемый набор по должности" : "Для должности не найден опубликованный набор"} onClick={() => onSourceChange("active_norms")} />
            <SourceOption active={source === "previous_card"} disabled={draftExists} label="Предыдущая карточка" text="Скопировать структуру без фактов выдачи" onClick={() => onSourceChange("previous_card")} />
            <SourceOption active={source === "empty"} disabled={draftExists} label="Пустой документ" text="Начать подбор вручную из каталога" onClick={() => onSourceChange("empty")} />
          </div>
        </section>
        <PpeButton className="ppe-issue-start-button" disabled={!ready || loading || (source === "active_norms" && !sourceReady)} icon={<ChevronRight size={17} />} loading={saving} onClick={onContinue} size="touch" variant="primary">{draftExists ? "Сохранить и продолжить" : "Продолжить к подбору"}</PpeButton>
      </aside>
    </div>
  );
}

export function SelectionStep({
  categories,
  issueLines,
  itemRows,
  loadingItems,
  onAddCatalog,
  onApplySet,
  onOpenCatalog,
  onRemoveExtra,
  onSelectAll,
  onToggle,
  selectionTab,
  setSelectionTab,
  settings,
}: {
  categories: InventoryPpeCardNormRowDto[];
  issueLines: PpeIssueDraftLine[];
  itemRows: InventoryPpeCardNormRowDto[];
  loadingItems: boolean;
  onAddCatalog: () => void;
  onApplySet: (set: InventoryItemSetDetailDto) => Promise<void>;
  onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void;
  onRemoveExtra: (rowId: string) => void;
  onSelectAll: () => void;
  onToggle: (row: InventoryPpeCardNormRowDto) => void;
  selectionTab: SelectionTab;
  setSelectionTab: (tab: SelectionTab) => void;
  settings: InventorySettingsDto | null;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectedIds = useMemo(() => new Set(issueLines.map((line) => line.cardNormRowId)), [issueLines]);
  const mappedCount = itemRows.filter((row) => row.mappedItemId).length;
  return (
    <section className="ppe-issue-card ppe-issue-selection-card">
      <CardHeading icon={<PackageSearch size={24} />} kicker="Шаг 2" title="Подбор СИЗ" text="Сопоставьте нормы с конкретной номенклатурой или добавьте дополнительную выдачу." />
      <div className="ppe-issue-selection-tabs" role="tablist" aria-label="Источники подбора СИЗ">
        <Tab active={selectionTab === "norms"} icon={<ShieldCheck size={16} />} label="По норме сотрудника" onClick={() => setSelectionTab("norms")} />
        <Tab active={selectionTab === "catalog"} icon={<PackageSearch size={16} />} label="Из каталога" onClick={() => setSelectionTab("catalog")} />
        <Tab active={selectionTab === "sets"} icon={<Layers3 size={16} />} label="Наборы" onClick={() => setSelectionTab("sets")} />
      </div>
      <div className="ppe-issue-toolbar">
        <div><strong>{selectionTab === "norms" ? "Нормативные позиции" : selectionTab === "catalog" ? "Дополнительная номенклатура" : "Типовые наборы"}</strong><span>{mappedCount} сопоставлено · {issueLines.length} выбрано для выдачи</span></div>
        <div className="ppe-issue-toolbar-actions"><PpeButton disabled={loadingItems} icon={<Plus size={16} />} onClick={onAddCatalog} variant="secondary">Добавить из каталога</PpeButton>{selectionTab === "norms" ? <PpeButton disabled={!mappedCount || loadingItems} icon={<Check size={16} />} onClick={onSelectAll} variant="secondary">Отметить сопоставленные</PpeButton> : null}</div>
      </div>
      {selectionTab === "norms" ? <div className="ppe-issue-norm-groups">{categories.map((category) => {
        const groupRows = itemRows.filter((row) => category.id === "base" ? !row.parentRowId : row.parentRowId === category.id);
        const isCollapsed = collapsed.has(category.id);
        return <section className="ppe-issue-norm-group" key={category.id}><button aria-expanded={!isCollapsed} className="ppe-issue-norm-group-toggle" onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(category.id) ? next.delete(category.id) : next.add(category.id); return next; })} type="button"><div><strong>{category.normItemName}</strong><span>{groupRows.length} позиций</span></div>{isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>{!isCollapsed ? <NormRows rows={groupRows} selectedIds={selectedIds} onOpenCatalog={onOpenCatalog} onRemoveExtra={onRemoveExtra} onToggle={onToggle} /> : null}</section>;
      })}</div> : null}
      {selectionTab === "catalog" ? <div className="ppe-issue-catalog-start"><div className="ppe-issue-catalog-hero"><PackageSearch size={28} /><div><h3>Каталог номенклатуры СИЗ</h3><p>Добавьте конкретное изделие в раздел «Дополнительная выдача».</p></div><PpeButton disabled={loadingItems} icon={<Plus size={16} />} onClick={onAddCatalog} variant="primary">Выбрать изделие</PpeButton></div><NormRows rows={itemRows.filter((row) => !row.sourceNormRowId)} selectedIds={selectedIds} onOpenCatalog={onOpenCatalog} onRemoveExtra={onRemoveExtra} onToggle={onToggle} /></div> : null}
      {selectionTab === "sets" ? <SetsStart settings={settings} onApply={onApplySet} /> : null}
    </section>
  );
}

function NormRows({ rows, selectedIds, onOpenCatalog, onRemoveExtra, onToggle }: { rows: InventoryPpeCardNormRowDto[]; selectedIds: Set<string>; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemoveExtra: (id: string) => void; onToggle: (row: InventoryPpeCardNormRowDto) => void }) {
  if (!rows.length) return <div className="ppe-issue-empty-inline"><PackageSearch size={18} /> Позиций пока нет</div>;
  return <><div className="ppe-issue-table-wrap ppe-issue-desktop-table"><table className="ppe-issue-table"><thead><tr><th>СИЗ по норме</th><th>Пункт нормы</th><th>Периодичность</th><th>Количество</th><th>Номенклатура</th><th>Проверка</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><label className="ppe-issue-row-check"><input checked={selectedIds.has(row.id)} disabled={!row.mappedItemId} onChange={() => onToggle(row)} type="checkbox" /><strong>{row.normItemName}</strong></label></td><td>{row.normPoint || "—"}</td><td>{row.issuePeriodText || "—"}</td><td>{row.quantityText || row.quantity}</td><td>{row.mappedItemName ? <><strong>{row.mappedItemName}</strong><small>{row.brandModelArticle || "Модель не уточнена"}</small></> : <span className="ppe-issue-warning-text">Нужно выбрать позицию</span>}</td><td><StatusBadge ready={Boolean(row.mappedItemId)} /></td><td><div className="ppe-issue-row-actions"><PpeButton onClick={() => onOpenCatalog(row)} variant="link">{row.mappedItemId ? "Изменить" : "Выбрать"}</PpeButton>{!row.sourceNormRowId ? <PpeButton aria-label={`Удалить ${row.normItemName}`} icon={<Trash2 size={15} />} onClick={() => onRemoveExtra(row.id)} size="compact" variant="danger" /> : null}</div></td></tr>)}</tbody></table></div><div className="ppe-issue-mobile-list">{rows.map((row) => <article className="ppe-issue-mobile-row" key={row.id}><header><label className="ppe-issue-row-check"><input checked={selectedIds.has(row.id)} disabled={!row.mappedItemId} onChange={() => onToggle(row)} type="checkbox" /><strong>{row.normItemName}</strong></label><StatusBadge ready={Boolean(row.mappedItemId)} /></header><dl><div><dt>Пункт нормы</dt><dd>{row.normPoint || "—"}</dd></div><div><dt>Периодичность</dt><dd>{row.issuePeriodText || "—"}</dd></div><div><dt>Количество</dt><dd>{row.quantityText || row.quantity}</dd></div><div><dt>Номенклатура</dt><dd>{row.mappedItemName || "Не выбрана"}<small>{row.brandModelArticle}</small></dd></div></dl><footer><PpeButton onClick={() => onOpenCatalog(row)} variant="secondary">{row.mappedItemId ? "Изменить изделие" : "Выбрать изделие"}</PpeButton>{!row.sourceNormRowId ? <PpeButton icon={<Trash2 size={15} />} onClick={() => onRemoveExtra(row.id)} variant="danger">Удалить</PpeButton> : null}</footer></article>)}</div></>;
}

export function CompositionStep({ issueLines, onChange, onOpenCatalog, onRemove, rows, selectedEmployee }: { issueLines: PpeIssueDraftLine[]; onChange: (id: string, patch: Partial<PpeIssueDraftLine>) => void; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemove: (id: string) => void; rows: InventoryPpeCardNormRowDto[]; selectedEmployee: InventoryEmployeeDto | null }) {
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  return <section className="ppe-issue-card ppe-issue-composition-card"><CardHeading icon={<FileCheck2 size={24} />} kicker="Шаг 3" title="Состав и проверка" text={`${selectedEmployee?.fullName ?? "Сотрудник"} · ${issueLines.length} позиций. Проверьте фактическое количество и способ выдачи.`} /><div className="ppe-issue-compliance-note"><ShieldCheck size={17} /><span>Нормативное количество не изменяется. Корректируется только состав текущего документа выдачи.</span></div><div className="ppe-issue-desktop-table ppe-issue-table-wrap"><table className="ppe-issue-table ppe-issue-composition-table"><thead><tr><th>№</th><th>Наименование СИЗ</th><th>Номенклатура</th><th>Дата</th><th>Количество</th><th>Способ</th><th>Проверка</th><th /></tr></thead><tbody>{issueLines.map((line, index) => <CompositionTableRow index={index} key={line.cardNormRowId} line={line} row={rowsById.get(line.cardNormRowId)} onChange={onChange} onOpenCatalog={onOpenCatalog} onRemove={onRemove} />)}</tbody></table></div><div className="ppe-issue-mobile-list">{issueLines.map((line, index) => <CompositionMobileRow index={index} key={line.cardNormRowId} line={line} row={rowsById.get(line.cardNormRowId)} onChange={onChange} onOpenCatalog={onOpenCatalog} onRemove={onRemove} />)}</div></section>;
}

function CompositionTableRow({ index, line, row, onChange, onOpenCatalog, onRemove }: CompositionRowProps) {
  const problems = validateIssueDraftLine(line, row);
  return <tr><td>{index + 1}</td><td><strong>{row?.normItemName ?? "Позиция"}</strong><small>{row?.normPoint || "Дополнительная выдача"}</small></td><td><strong>{row?.mappedItemName || "Не выбрана"}</strong><small>{line.brandModelArticle}</small></td><td><input aria-label={`Дата выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issuedAt: event.target.value })} type="date" value={line.issuedAt} /></td><td><input aria-label={`Количество ${row?.normItemName ?? "позиции"}`} inputMode="decimal" min="0.01" onChange={(event) => onChange(line.cardNormRowId, { quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></td><td><select aria-label={`Способ выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issueMethod: event.target.value as PpeIssueDraftLine["issueMethod"] })} value={line.issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></td><td><ProblemBadges problems={problems} /></td><td><div className="ppe-issue-row-actions"><PpeButton disabled={!row} onClick={() => row && onOpenCatalog(row)} variant="link">Заменить</PpeButton><PpeButton aria-label="Исключить из выдачи" icon={<Trash2 size={15} />} onClick={() => onRemove(line.cardNormRowId)} size="compact" variant="danger" /></div></td></tr>;
}

function CompositionMobileRow(props: CompositionRowProps) {
  const { index, line, row, onChange, onOpenCatalog, onRemove } = props;
  const problems = validateIssueDraftLine(line, row);
  return <article className="ppe-issue-mobile-row ppe-issue-composition-mobile"><header><span className="ppe-issue-row-number">{index + 1}</span><div><strong>{row?.normItemName ?? "Позиция"}</strong><small>{row?.mappedItemName || "Номенклатура не выбрана"}</small></div><ProblemBadges problems={problems} /></header><div className="ppe-issue-mobile-fields"><label><span>Дата выдачи</span><input onChange={(event) => onChange(line.cardNormRowId, { issuedAt: event.target.value })} type="date" value={line.issuedAt} /></label><label><span>Количество</span><input inputMode="decimal" min="0.01" onChange={(event) => onChange(line.cardNormRowId, { quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></label><label><span>Способ</span><select onChange={(event) => onChange(line.cardNormRowId, { issueMethod: event.target.value as PpeIssueDraftLine["issueMethod"] })} value={line.issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></label></div><footer><PpeButton disabled={!row} onClick={() => row && onOpenCatalog(row)} variant="secondary">Заменить изделие</PpeButton><PpeButton icon={<Trash2 size={15} />} onClick={() => onRemove(line.cardNormRowId)} variant="danger">Исключить</PpeButton></footer></article>;
}

type CompositionRowProps = { index: number; line: PpeIssueDraftLine; row?: InventoryPpeCardNormRowDto; onChange: (id: string, patch: Partial<PpeIssueDraftLine>) => void; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemove: (id: string) => void };

export function PrintStep({ committed, data, downloadFormat, errors, mode, onDownload, onModeChange, onPreview, onPrint, onSave, saving }: { committed: boolean; data: PrintData; downloadFormat: "pdf" | "docx" | null; errors: string[]; mode: PrintMode; onDownload: (format: "pdf" | "docx") => void; onModeChange: (mode: PrintMode) => void; onPreview: () => void; onPrint: () => void; onSave: () => void; saving: boolean }) {
  return <section className="ppe-issue-card ppe-issue-print-card"><CardHeading icon={<Printer size={24} />} kicker="Шаг 4" title="Печать и предпросмотр" text="Проверьте реальную форму документа перед сохранением выдачи." />{errors.length ? <div className="ppe-issue-print-warning" role="alert"><strong>Документ пока нельзя сохранить</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul><span>Предпросмотр и экспорт доступны для проверки макета.</span></div> : null}<div className="ppe-issue-print-toolbar"><div className="ppe-issue-print-tabs" role="tablist"><Tab active={mode === "card"} label="Личная карточка" onClick={() => onModeChange("card")} /><Tab active={mode === "sheet"} label="Лист выдачи" onClick={() => onModeChange("sheet")} /></div><div><PpeButton onClick={onPreview} variant="secondary">Открыть крупно</PpeButton><PpeButton icon={<Printer size={15} />} onClick={onPrint} variant="secondary">Печать</PpeButton><PpeButton disabled={Boolean(downloadFormat && downloadFormat !== "pdf")} icon={<FileText size={15} />} loading={downloadFormat === "pdf"} onClick={() => onDownload("pdf")} variant="secondary">PDF</PpeButton><PpeButton disabled={Boolean(downloadFormat && downloadFormat !== "docx")} icon={<FileText size={15} />} loading={downloadFormat === "docx"} onClick={() => onDownload("docx")} variant="secondary">DOCX</PpeButton></div></div><div className="ppe-issue-print-paper-wrap"><PrintPaper data={data} mode={mode} /></div><div className="ppe-issue-save-panel"><div><strong>{committed ? "Документ выдачи сохранён" : "Готовы сохранить выдачу?"}</strong><span>{committed ? "Запись добавлена в историю сотрудника." : "Финальное сохранение создаст все факты выдачи одной операцией."}</span></div><PpeButton disabled={committed || errors.length > 0} icon={<CheckCircle2 size={16} />} loading={saving} onClick={onSave} variant="primary">{committed ? "Сохранено" : "Сохранить документ выдачи"}</PpeButton></div></section>;
}

function SetsStart({ settings, onApply }: { settings: InventorySettingsDto | null; onApply: (set: InventoryItemSetDetailDto) => Promise<void> }) {
  const repository = useInventoryRepository();
  const sets = settings?.itemSets?.filter((item) => item.isActive) ?? [];
  const [detail, setDetail] = useState<InventoryItemSetDetailDto | null>(null);
  const [loadingId, setLoadingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const actionRef = useRef<"open" | "apply" | null>(null);
  async function open(id: string) {
    if (actionRef.current) return;
    actionRef.current = "open";
    setLoadingId(id);
    setError("");
    try { setDetail(await repository.getItemSet(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить набор"); }
    finally { actionRef.current = null; setLoadingId(""); }
  }
  async function apply() {
    if (!detail || actionRef.current) return;
    actionRef.current = "apply";
    setSaving(true);
    setError("");
    try { await onApply(detail); setDetail(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось применить набор"); }
    finally { actionRef.current = null; setSaving(false); }
  }
  return <div className="ppe-issue-catalog-start"><div className="ppe-issue-catalog-hero"><Layers3 size={28} /><div><h3>Наборы СИЗ</h3><p>Просмотрите состав перед добавлением. Дублирующиеся товары не создаются повторно.</p></div></div>{error ? <div className="ppe-issue-error" role="alert">{error}</div> : null}{sets.length ? <div className="ppe-issue-set-list">{sets.map((set) => <article key={set.id}><div><strong>{set.name}</strong><span>{set.itemsCount} позиций</span></div><PpeButton disabled={Boolean(loadingId) && loadingId !== set.id} loading={loadingId === set.id} onClick={() => void open(set.id)} variant="secondary">Посмотреть</PpeButton></article>)}</div> : <div className="ppe-issue-empty-inline"><Layers3 size={19} /> Наборы ещё не настроены</div>}{detail ? <section className="ppe-issue-set-preview"><header><div><strong>{detail.name}</strong><span>{detail.items.length} позиций</span></div><PpeButton aria-label="Закрыть состав набора" disabled={saving} onClick={() => setDetail(null)} variant="link">Закрыть</PpeButton></header><ul>{detail.items.map((line) => <li key={line.id}><span><strong>{line.item.name}</strong><small>{[line.item.article, line.item.category].filter(Boolean).join(" · ")}</small></span><b>{line.quantity} {line.item.unit}</b></li>)}</ul><PpeButton loading={saving} onClick={() => void apply()} variant="primary">Добавить набор в выдачу</PpeButton></section> : null}</div>;
}

function CardHeading({ icon, kicker, text, title }: { icon: ReactNode; kicker: string; text?: string; title: string }) { return <div className="ppe-issue-card-heading"><div><span className="ppe-issue-card-kicker">{kicker}</span><h2>{title}</h2>{text ? <p>{text}</p> : null}</div>{icon}</div>; }
function SourceOption({ active, disabled, label, text, onClick }: { active: boolean; disabled?: boolean; label: string; text: string; onClick: () => void }) { return <button className={`${active ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`} disabled={disabled} onClick={onClick} type="button"><span className="ppe-issue-radio">{active ? <Check size={14} /> : null}</span><span><strong>{label}</strong><small>{text}</small></span></button>; }
function Tab({ active, icon, label, onClick }: { active: boolean; icon?: ReactNode; label: string; onClick: () => void }) { return <button aria-selected={active} className={active ? "is-active" : ""} onClick={onClick} role="tab" type="button">{icon}{label}</button>; }
function StatusBadge({ ready }: { ready: boolean }) { return <span className={ready ? "ppe-issue-badge is-ready" : "ppe-issue-badge is-warning"}>{ready ? "Готово" : "Требует выбора"}</span>; }
function ProblemBadges({ problems }: { problems: PpeIssueLineProblem[] }) { return problems.length ? <div className="ppe-issue-problems">{problems.map((problem) => <span className={`is-${problem.level}`} key={problem.text}>{problem.text}</span>)}</div> : <span className="ppe-issue-badge is-ready">Готово</span>; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(); }
function detailLabel(field: keyof PpeEmployeeCardDetails) { return ({ clothingSize: "Размер одежды", gender: "Пол", handProtectionSize: "СИЗ рук", headSize: "Размер головного убора", height: "Рост", respiratorSize: "СИЗОД", shoeSize: "Размер обуви" })[field]; }
function detailPlaceholder(field: keyof PpeEmployeeCardDetails) { return field === "gender" ? "муж. / жен." : field === "height" ? "например 176" : "не заполнено"; }