import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
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
  RefreshCw,
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
import { PpeButton, PpeModalShell } from "./PpeUi";
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
  const missingFields = [
    !employeeId ? "сотрудник" : "",
    !issueDate ? "дата выдачи" : "",
    !responsible.trim() ? "ответственный" : "",
    !basis.trim() ? "основание" : "",
    source === "active_norms" && !sourceReady ? "действующая норма" : "",
  ].filter(Boolean);
  const ready = missingFields.length === 0;
  return (
    <div className="ppe-issue-step-grid">
      <section className="ppe-issue-card ppe-issue-employee-card">
        <CardHeading icon={<UserRound size={22} />} kicker="Шаг 1" title="Сотрудник" text="Выберите владельца личной карточки и проверьте данные, которые попадут в печатную форму." />
        <div className="ppe-issue-form-section">
          <div className="ppe-issue-section-label"><strong>Поиск и выбор</strong><span>{draftExists ? "Сотрудник закреплён за сохранённым черновиком" : "Поиск по ФИО, табельному номеру, подразделению или должности"}</span></div>
          <label className="ppe-issue-field-wide"><span>Поиск сотрудника</span><div className="ppe-issue-search"><Search size={17} /><input disabled={draftExists} onChange={(event) => onQueryChange(event.target.value)} placeholder="ФИО, табельный номер, подразделение или должность" value={query} /></div></label>
          <label className={`ppe-issue-field-wide ${!employeeId ? "has-error" : ""}`}><span>Сотрудник <em>*</em></span><select aria-invalid={!employeeId} disabled={loading || draftExists} onChange={(event) => onEmployeeChange(event.target.value)} value={employeeId}><option value="">Выберите сотрудника</option>{filtered.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.personnelNo}</option>)}</select></label>
        </div>
        {employee ? <div className={`ppe-issue-employee-summary ${draftExists ? "is-locked" : ""}`}><span className="ppe-issue-avatar">{initials(employee.fullName)}</span><div><span className="ppe-issue-mobile-label">Владелец карточки</span><strong>{employee.fullName}</strong><small>{employee.position} · {employee.department}</small><small>Табельный номер: {employee.personnelNo}</small></div><span className="ppe-issue-ready"><CheckCircle2 size={15} /> {draftExists ? "Закреплён" : "Выбран"}</span></div> : <div className="ppe-issue-empty-inline"><UserRound size={18} /> Сотрудник ещё не выбран</div>}
        <div className="ppe-issue-form-section">
          <div className="ppe-issue-section-label"><strong>Характеристики для личной карточки</strong><span>Размеры сохраняются в карточке сотрудника, но не выводятся в рабочих таблицах выдачи.</span></div>
          <div className="ppe-issue-detail-grid">{(["gender", "height", "clothingSize", "shoeSize", "headSize", "respiratorSize", "handProtectionSize"] as Array<keyof PpeEmployeeCardDetails>).map((field) => <label key={field}><span>{detailLabel(field)}</span><input onChange={(event) => onDetailsChange(field, event.target.value)} placeholder={detailPlaceholder(field)} value={details[field] ?? ""} /></label>)}</div>
        </div>
      </section>
      <aside className="ppe-issue-side-stack">
        <section className="ppe-issue-card ppe-issue-document-card">
          <CardHeading icon={<FileText size={22} />} kicker="Документ" title="Параметры выдачи" text="Поля со звёздочкой обязательны для сохранения черновика." />
          <div className="ppe-issue-form-grid">
            <label className={!issueDate ? "has-error" : ""}><span>Дата выдачи <em>*</em></span><div className="ppe-issue-input-icon"><CalendarDays size={15} /><input aria-invalid={!issueDate} onChange={(event) => onIssueDateChange(event.target.value)} required type="date" value={issueDate} /></div></label>
            <label><span>Вид выдачи <em>*</em></span><select onChange={(event) => onIssueTypeChange(event.target.value as IssueType)} value={issueType}><option value="primary">Первичная</option><option value="planned">Плановая</option><option value="replacement">Замена</option><option value="additional">Дополнительная</option></select></label>
            <label className={!responsible.trim() ? "has-error" : ""}><span>Ответственный <em>*</em></span><input aria-invalid={!responsible.trim()} onChange={(event) => onResponsibleChange(event.target.value)} placeholder="ФИО ответственного" required value={responsible} /></label>
            <label className={!basis.trim() ? "has-error" : ""}><span>Основание <em>*</em></span><input aria-invalid={!basis.trim()} onChange={(event) => onBasisChange(event.target.value)} placeholder="Приказ или нормативный документ" required value={basis} /></label>
          </div>
        </section>
        <section className="ppe-issue-card ppe-issue-source-card">
          <CardHeading icon={<ShieldCheck size={22} />} kicker="Источник" title="Состав карточки" text="Источник задаёт первоначальный перечень, но не создаёт факт выдачи." />
          <div className="ppe-issue-source-options">
            <SourceOption active={source === "active_norms"} disabled={draftExists || !sourceReady} label="Действующие нормы" text={sourceReady ? "Рекомендуемый перечень по должности сотрудника" : "Для должности не найден опубликованный набор норм"} onClick={() => onSourceChange("active_norms")} />
            <SourceOption active={source === "previous_card"} disabled={draftExists} label="Предыдущая карточка" text="Скопировать нормативную структуру без истории выдач" onClick={() => onSourceChange("previous_card")} />
            <SourceOption active={source === "empty"} disabled={draftExists} label="Пустой документ" text="Начать подбор вручную из каталога номенклатуры" onClick={() => onSourceChange("empty")} />
          </div>
        </section>
        <div className={`ppe-issue-form-status ${ready ? "is-ready" : "is-warning"}`} role="status"><span>{ready ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><div><strong>{ready ? "Можно переходить к подбору" : "Заполните обязательные данные"}</strong><small>{ready ? "Черновик сохранит сотрудника, реквизиты и выбранный источник." : `Не заполнено: ${missingFields.join(", ")}.`}</small></div></div>
        <PpeButton className="ppe-issue-start-button" disabled={!ready || loading} icon={<ChevronRight size={17} />} loading={saving} onClick={onContinue} size="touch" variant="primary">{draftExists ? "Сохранить и продолжить" : "Продолжить к подбору"}</PpeButton>
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
  settingsError,
  onRetrySettings,
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
  settingsError: string;
  onRetrySettings: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selectedIds = useMemo(() => new Set(issueLines.map((line) => line.cardNormRowId)), [issueLines]);
  const mappedCount = itemRows.filter((row) => row.mappedItemId).length;
  const readyToAddCount = itemRows.filter((row) => row.mappedItemId && !selectedIds.has(row.id)).length;
  const unmappedCount = itemRows.length - mappedCount;
  const extraCount = itemRows.filter((row) => !row.sourceNormRowId).length;
  return (
    <section className="ppe-issue-card ppe-issue-selection-card">
      <CardHeading icon={<PackageSearch size={24} />} kicker="Шаг 2" title="Подбор СИЗ" text="Сначала сопоставьте норматив с конкретным изделием, затем добавьте готовые позиции в текущий документ." />
      <div className="ppe-issue-selection-tabs" role="tablist" aria-label="Источники подбора СИЗ">
        <Tab active={selectionTab === "norms"} disabled={loadingItems} icon={<ShieldCheck size={16} />} label="По норме сотрудника" onClick={() => setSelectionTab("norms")} />
        <Tab active={selectionTab === "catalog"} disabled={loadingItems} icon={<PackageSearch size={16} />} label="Из каталога" onClick={() => setSelectionTab("catalog")} />
        <Tab active={selectionTab === "sets"} disabled={loadingItems} icon={<Layers3 size={16} />} label="Наборы" onClick={() => setSelectionTab("sets")} />
      </div>
      <div className="ppe-issue-toolbar">
        <div><strong>{selectionTab === "norms" ? "Нормативные позиции" : selectionTab === "catalog" ? "Дополнительная выдача" : "Типовые наборы"}</strong><span>{selectionTab === "norms" ? "Выберите изделие для нормы и включите его в документ" : selectionTab === "catalog" ? "Добавляйте товары, которых нет в нормативном перечне" : "Проверьте состав набора перед применением"}</span></div>
        <div className="ppe-issue-toolbar-actions"><PpeButton disabled={loadingItems} icon={<Plus size={16} />} onClick={onAddCatalog} variant="primary">Добавить из каталога</PpeButton>{selectionTab === "norms" ? <PpeButton disabled={!readyToAddCount || loadingItems} icon={<Check size={16} />} onClick={onSelectAll} variant="secondary">Добавить готовые{readyToAddCount ? ` (${readyToAddCount})` : ""}</PpeButton> : null}</div>
      </div>
      <SelectionSummary extra={extraCount} mapped={mappedCount} selected={issueLines.length} total={itemRows.length} unmapped={unmappedCount} />
      {selectionTab === "norms" ? <div className="ppe-issue-norm-groups">{categories.map((category) => {
        const groupRows = itemRows.filter((row) => category.id === "base" ? !row.parentRowId : row.parentRowId === category.id);
        const groupMapped = groupRows.filter((row) => row.mappedItemId).length;
        const groupSelected = groupRows.filter((row) => selectedIds.has(row.id)).length;
        const isCollapsed = collapsed.has(category.id);
        return <section className={`ppe-issue-norm-group ${groupRows.length > 0 && groupMapped === groupRows.length ? "is-complete" : ""}`} id={`ppe-norm-group-${category.id}`} key={category.id}><button aria-controls={`ppe-norm-group-${category.id}`} aria-expanded={!isCollapsed} className="ppe-issue-norm-group-toggle" disabled={loadingItems} onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(category.id) ? next.delete(category.id) : next.add(category.id); return next; })} type="button"><div><strong>{category.normItemName}</strong><span>{groupRows.length} позиций · {groupMapped} сопоставлено · {groupSelected} в документе</span></div>{isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</button>{!isCollapsed ? <NormRows rows={groupRows} selectedIds={selectedIds} busy={loadingItems} onOpenCatalog={onOpenCatalog} onRemoveExtra={onRemoveExtra} onToggle={onToggle} /> : null}</section>;
      })}</div> : null}
      {selectionTab === "catalog" ? <div className="ppe-issue-catalog-start"><div className="ppe-issue-catalog-hero"><PackageSearch size={28} /><div><h3>Дополнительная выдача</h3><p>Выбранные товары сохраняются отдельно от нормы сотрудника и добавляются только в текущий документ.</p></div><PpeButton disabled={loadingItems} icon={<Plus size={16} />} onClick={onAddCatalog} variant="primary">Выбрать изделия</PpeButton></div><NormRows rows={itemRows.filter((row) => !row.sourceNormRowId)} selectedIds={selectedIds} busy={loadingItems} onOpenCatalog={onOpenCatalog} onRemoveExtra={onRemoveExtra} onToggle={onToggle} /></div> : null}
      {selectionTab === "sets" ? <SetsStart onApply={onApplySet} onRetrySettings={onRetrySettings} settings={settings} settingsError={settingsError} /> : null}
    </section>
  );
}

function SelectionSummary({ extra, mapped, selected, total, unmapped }: { extra: number; mapped: number; selected: number; total: number; unmapped: number }) {
  return <div aria-label="Сводка подбора СИЗ" aria-live="polite" className="ppe-issue-selection-summary">
    <div><strong>{total}</strong><span>Всего позиций</span></div>
    <div className="is-ready"><strong>{mapped}</strong><span>Сопоставлено</span></div>
    <div className={unmapped ? "is-warning" : "is-ready"}><strong>{unmapped}</strong><span>Требуют выбора</span></div>
    <div className="is-selected"><strong>{selected}</strong><span>В документе</span></div>
    {extra ? <div className="is-extra"><strong>{extra}</strong><span>Дополнительно</span></div> : null}
  </div>;
}

function NormRows({ busy, rows, selectedIds, onOpenCatalog, onRemoveExtra, onToggle }: { busy: boolean; rows: InventoryPpeCardNormRowDto[]; selectedIds: Set<string>; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemoveExtra: (id: string) => void; onToggle: (row: InventoryPpeCardNormRowDto) => void }) {
  if (!rows.length) return <div className="ppe-issue-empty-inline"><PackageSearch size={18} /> В этом разделе позиций пока нет</div>;
  return <>
    <div className="ppe-issue-table-wrap ppe-issue-desktop-table"><table aria-label="Нормативные позиции и номенклатура" className="ppe-issue-table ppe-issue-selection-table"><thead><tr><th>Позиция</th><th>Пункт и периодичность</th><th>Количество по норме</th><th>Выбранное изделие</th><th>Состояние</th><th>Действия</th></tr></thead><tbody>{rows.map((row) => {
      const selected = selectedIds.has(row.id);
      const mapped = Boolean(row.mappedItemId);
      const extra = !row.sourceNormRowId;
      return <tr className={`${selected ? "is-selected" : ""} ${mapped ? "is-mapped" : "is-unmapped"}`} key={row.id}><td><div className="ppe-issue-selection-name"><strong>{row.normItemName}</strong><small>{extra ? "Дополнительная выдача" : "Нормативная позиция"}</small></div></td><td><strong>{row.normPoint || "—"}</strong><small>{row.issuePeriodText || "Период не указан"}</small></td><td>{row.quantityText || row.quantity}</td><td>{mapped ? <div className="ppe-issue-selection-product"><strong>{row.mappedItemName}</strong><small>{row.brandModelArticle || "Модель и артикул не указаны"}</small></div> : <span className="ppe-issue-warning-text">Сначала выберите изделие</span>}</td><td><StatusBadge mapped={mapped} selected={selected} /></td><td><div className="ppe-issue-row-actions"><PpeButton disabled={busy} onClick={() => onOpenCatalog(row)} variant="secondary">{mapped ? "Заменить" : "Выбрать изделие"}</PpeButton>{mapped ? <PpeButton disabled={busy} icon={selected ? undefined : <Check size={15} />} onClick={() => onToggle(row)} variant={selected ? "ghost" : "primary"}>{selected ? "Убрать из документа" : "Добавить в документ"}</PpeButton> : null}{extra ? <PpeButton aria-label={`Удалить дополнительную позицию ${row.normItemName}`} disabled={busy} icon={<Trash2 size={15} />} onClick={() => onRemoveExtra(row.id)} size="compact" variant="danger" /> : null}</div></td></tr>;
    })}</tbody></table></div>
    <div className="ppe-issue-mobile-list">{rows.map((row) => {
      const selected = selectedIds.has(row.id);
      const mapped = Boolean(row.mappedItemId);
      const extra = !row.sourceNormRowId;
      return <article className={`ppe-issue-mobile-row ppe-issue-selection-mobile ${selected ? "is-selected" : ""} ${mapped ? "is-mapped" : "is-unmapped"}`} key={row.id}><header><div><span className="ppe-issue-mobile-label">{extra ? "Дополнительная выдача" : "Норма сотрудника"}</span><strong>{row.normItemName}</strong><small>{row.normPoint || "Пункт нормы не указан"}</small></div><StatusBadge mapped={mapped} selected={selected} /></header><div className="ppe-issue-mobile-product"><span>Выбранное изделие</span><strong>{row.mappedItemName || "Номенклатура не выбрана"}</strong><small>{row.brandModelArticle || (mapped ? "Модель и артикул не указаны" : "Откройте каталог для сопоставления")}</small></div><dl><div><dt>Периодичность</dt><dd>{row.issuePeriodText || "—"}</dd></div><div><dt>Количество по норме</dt><dd>{row.quantityText || row.quantity}</dd></div></dl><footer><PpeButton disabled={busy} onClick={() => onOpenCatalog(row)} variant="secondary">{mapped ? "Заменить изделие" : "Выбрать изделие"}</PpeButton>{mapped ? <PpeButton disabled={busy} icon={selected ? undefined : <Check size={15} />} onClick={() => onToggle(row)} variant={selected ? "ghost" : "primary"}>{selected ? "Убрать из документа" : "Добавить в документ"}</PpeButton> : null}{extra ? <PpeButton disabled={busy} icon={<Trash2 size={15} />} onClick={() => onRemoveExtra(row.id)} variant="danger">Удалить дополнительную</PpeButton> : null}</footer></article>;
    })}</div>
  </>;
}
export function CompositionStep({ issueLines, onChange, onOpenCatalog, onRemove, rows, selectedEmployee }: { issueLines: PpeIssueDraftLine[]; onChange: (id: string, patch: Partial<PpeIssueDraftLine>) => void; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemove: (id: string) => void; rows: InventoryPpeCardNormRowDto[]; selectedEmployee: InventoryEmployeeDto | null }) {
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const review = useMemo(() => summarizeComposition(issueLines, rowsById), [issueLines, rowsById]);
  const [pendingRemove, setPendingRemove] = useState<PpeIssueDraftLine | null>(null);
  const requestRemove = (id: string) => setPendingRemove(issueLines.find((line) => line.cardNormRowId === id) ?? null);
  return <>
    <section className="ppe-issue-card ppe-issue-composition-card">
    <CardHeading icon={<FileCheck2 size={24} />} kicker="Шаг 3" title="Состав и проверка" text={`${selectedEmployee?.fullName ?? "Сотрудник"} · ${issueLines.length} позиций. Проверьте фактическое количество и способ выдачи.`} />
    <CompositionSummary summary={review} />
    <div className="ppe-issue-compliance-note"><ShieldCheck size={17} /><span>Норматив остаётся без изменений. Здесь редактируется только фактическая выдача: изделие, дата, количество и способ.</span></div>
    {issueLines.length ? <>
      <div className="ppe-issue-desktop-table ppe-issue-table-wrap">
        <table aria-label="Состав документа выдачи СИЗ" className="ppe-issue-table ppe-issue-composition-table">
          <thead><tr><th>№</th><th>Норма сотрудника</th><th>Фактическое изделие</th><th>Дата</th><th>Количество</th><th>Способ</th><th>Проверка</th><th>Действия</th></tr></thead>
          <tbody>{issueLines.map((line, index) => <CompositionTableRow index={index} key={line.cardNormRowId} line={line} row={rowsById.get(line.cardNormRowId)} onChange={onChange} onOpenCatalog={onOpenCatalog} onRemove={requestRemove} />)}</tbody>
        </table>
      </div>
      <div className="ppe-issue-mobile-list">{issueLines.map((line, index) => <CompositionMobileRow index={index} key={line.cardNormRowId} line={line} row={rowsById.get(line.cardNormRowId)} onChange={onChange} onOpenCatalog={onOpenCatalog} onRemove={requestRemove} />)}</div>
    </> : <div className="ppe-issue-composition-empty"><PackageSearch size={28} /><div><strong>В документе пока нет позиций</strong><span>Вернитесь к подбору и добавьте СИЗ по норме или из каталога.</span></div></div>}
    </section>
    {pendingRemove ? (
      <PpeModalShell
        ariaLabel="Исключить позицию из документа"
        className="ppe-v2-action-modal"
        description="Нормативная строка останется без изменений. Изменение относится только к текущему документу."
        eyebrow="Действие со строкой"
        footer={(
          <>
            <PpeButton onClick={() => setPendingRemove(null)} variant="ghost">Отмена</PpeButton>
            <PpeButton className="ppe-issue-remove-confirm" onClick={() => { onRemove(pendingRemove.cardNormRowId); setPendingRemove(null); }} variant="danger">Исключить из документа</PpeButton>
          </>
        )}
        initialFocusSelector=".ppe-issue-remove-confirm"
        onClose={() => setPendingRemove(null)}
        title="Исключить позицию?"
      >
        <div className="ppe-v2-operation-summary">
          <div><small>Позиция</small><strong>{rowsById.get(pendingRemove.cardNormRowId)?.normItemName ?? "СИЗ"}</strong></div>
          <div><small>Действие</small><strong>Только текущий документ</strong><span>Норматив и каталог не изменятся.</span></div>
        </div>
      </PpeModalShell>
    ) : null}
  </>;
}

function CompositionTableRow({ index, line, row, onChange, onOpenCatalog, onRemove }: CompositionRowProps) {
  const problems = validateIssueDraftLine(line, row);
  const tone = problemTone(problems);
  return <tr className={`ppe-issue-composition-row is-${tone}`}>
    <td><span className="ppe-issue-table-index">{index + 1}</span></td>
    <td><div className="ppe-issue-norm-cell"><strong>{row?.normItemName ?? "Позиция"}</strong><small>{row?.normPoint || "Дополнительная выдача"}</small>{row ? <span>Норма: {row.quantityText || row.quantity} · {row.issuePeriodText || "период не указан"}</span> : null}</div></td>
    <td><div className="ppe-issue-product-cell"><strong>{row?.mappedItemName || "Номенклатура не выбрана"}</strong><small>{line.brandModelArticle || "Модель и артикул не указаны"}</small></div></td>
    <td><input aria-label={`Дата выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issuedAt: event.target.value })} type="date" value={line.issuedAt} /></td>
    <td><input aria-label={`Количество ${row?.normItemName ?? "позиции"}`} inputMode="decimal" min="0.01" onChange={(event) => onChange(line.cardNormRowId, { quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></td>
    <td><select aria-label={`Способ выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issueMethod: event.target.value as PpeIssueDraftLine["issueMethod"] })} value={line.issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></td>
    <td><ProblemBadges problems={problems} /></td>
    <td><div className="ppe-issue-row-actions"><PpeButton disabled={!row} onClick={() => row && onOpenCatalog(row)} variant="secondary">Заменить</PpeButton><PpeButton aria-label="Исключить из текущего документа" icon={<Trash2 size={15} />} onClick={() => onRemove(line.cardNormRowId)} size="compact" variant="danger" /></div></td>
  </tr>;
}

function CompositionMobileRow(props: CompositionRowProps) {
  const { index, line, row, onChange, onOpenCatalog, onRemove } = props;
  const problems = validateIssueDraftLine(line, row);
  const tone = problemTone(problems);
  return <article className={`ppe-issue-mobile-row ppe-issue-composition-mobile is-${tone}`}>
    <header><span className="ppe-issue-row-number">{index + 1}</span><div><span className="ppe-issue-mobile-label">Норма сотрудника</span><strong>{row?.normItemName ?? "Позиция"}</strong><small>{row?.normPoint || "Дополнительная выдача"}</small></div></header>
    <div className="ppe-issue-mobile-product"><span>Фактическое изделие</span><strong>{row?.mappedItemName || "Номенклатура не выбрана"}</strong><small>{line.brandModelArticle || "Модель и артикул не указаны"}</small></div>
    <ProblemBadges problems={problems} />
    <div className="ppe-issue-mobile-fields">
      <label><span>Дата выдачи</span><input aria-label={`Дата выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issuedAt: event.target.value })} type="date" value={line.issuedAt} /></label>
      <label><span>Фактическое количество</span><input aria-label={`Количество ${row?.normItemName ?? "позиции"}`} inputMode="decimal" min="0.01" onChange={(event) => onChange(line.cardNormRowId, { quantity: Number(event.target.value) })} step="0.01" type="number" value={line.quantity} /></label>
      <label><span>Способ выдачи</span><select aria-label={`Способ выдачи ${row?.normItemName ?? "позиции"}`} onChange={(event) => onChange(line.cardNormRowId, { issueMethod: event.target.value as PpeIssueDraftLine["issueMethod"] })} value={line.issueMethod}><option value="personal">Лично</option><option value="dispenser">Дозатор</option></select></label>
    </div>
    {row ? <div className="ppe-issue-mobile-norm-note">По норме: {row.quantityText || row.quantity} · {row.issuePeriodText || "период не указан"}</div> : null}
    <footer><PpeButton disabled={!row} onClick={() => row && onOpenCatalog(row)} variant="secondary">Заменить изделие</PpeButton><PpeButton icon={<Trash2 size={15} />} onClick={() => onRemove(line.cardNormRowId)} variant="danger">Исключить из документа</PpeButton></footer>
  </article>;
}

type CompositionRowProps = { index: number; line: PpeIssueDraftLine; row?: InventoryPpeCardNormRowDto; onChange: (id: string, patch: Partial<PpeIssueDraftLine>) => void; onOpenCatalog: (row: InventoryPpeCardNormRowDto) => void; onRemove: (id: string) => void };
type CompositionSummaryData = { total: number; ready: number; warnings: number; errors: number };

function CompositionSummary({ summary }: { summary: CompositionSummaryData }) {
  return <div aria-label="Итоги проверки состава" aria-live="polite" className="ppe-issue-review-summary">
    <div><FileText size={18} /><span><strong>{summary.total}</strong><small>Всего позиций</small></span></div>
    <div className="is-ready"><CheckCircle2 size={18} /><span><strong>{summary.ready}</strong><small>Готово</small></span></div>
    <div className="is-warning"><AlertTriangle size={18} /><span><strong>{summary.warnings}</strong><small>Предупреждения</small></span></div>
    <div className="is-error"><AlertTriangle size={18} /><span><strong>{summary.errors}</strong><small>Ошибки</small></span></div>
  </div>;
}

function summarizeComposition(issueLines: PpeIssueDraftLine[], rowsById: Map<string, InventoryPpeCardNormRowDto>): CompositionSummaryData {
  return issueLines.reduce<CompositionSummaryData>((summary, line) => {
    const problems = validateIssueDraftLine(line, rowsById.get(line.cardNormRowId));
    summary.total += 1;
    if (problems.some((problem) => problem.level === "error")) summary.errors += 1;
    else if (problems.some((problem) => problem.level === "warning")) summary.warnings += 1;
    else summary.ready += 1;
    return summary;
  }, { total: 0, ready: 0, warnings: 0, errors: 0 });
}

function problemTone(problems: PpeIssueLineProblem[]) {
  if (problems.some((problem) => problem.level === "error")) return "error";
  if (problems.some((problem) => problem.level === "warning")) return "warning";
  return "ready";
}

export function PrintStep({ committed, data, downloadFormat, errors, mode, onDownload, onModeChange, onPreview, onPrint, onSave, printBusy, saving }: { committed: boolean; data: PrintData; downloadFormat: "pdf" | "docx" | null; errors: string[]; mode: PrintMode; onDownload: (format: "pdf" | "docx") => void; onModeChange: (mode: PrintMode) => void; onPreview: () => void; onPrint: () => void; onSave: () => void; printBusy: boolean; saving: boolean }) {
  const documentTitle = mode === "card" ? "Личная карточка" : "Лист выдачи";
  const hasBlockingErrors = errors.length > 0;
  const exportBusy = Boolean(downloadFormat);

  return (
    <section className="ppe-issue-card ppe-issue-print-card">
      <CardHeading icon={<Printer size={24} />} kicker="Шаг 4" title="Печать и предпросмотр" text="Выберите форму, проверьте документ и только затем сохраните фактическую выдачу." />

      <div aria-label="Готовность документа" className="ppe-issue-print-progress">
        <div className="is-complete"><FileText size={18} /><span><strong>1. Форма</strong><small>{documentTitle} выбрана</small></span></div>
        <div className="is-active"><Printer size={18} /><span><strong>2. Проверка</strong><small>Предпросмотр и экспорт</small></span></div>
        <div className={committed ? "is-complete" : hasBlockingErrors ? "is-blocked" : ""}><CheckCircle2 size={18} /><span><strong>3. Сохранение</strong><small>{committed ? "Документ сохранён" : hasBlockingErrors ? "Есть критические ошибки" : "Готово к сохранению"}</small></span></div>
      </div>

      {hasBlockingErrors ? (
        <div className="ppe-issue-print-warning" role="alert">
          <strong><AlertTriangle size={17} /> Документ пока нельзя сохранить</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
          <span>Предпросмотр, печать и экспорт доступны: исправьте ошибки перед финальным сохранением.</span>
        </div>
      ) : (
        <div className="ppe-issue-print-ready" role="status"><CheckCircle2 size={17} /><span><strong>Проверка пройдена</strong><small>Критических ошибок нет. Документ можно сохранить после просмотра.</small></span></div>
      )}

      <div className="ppe-issue-print-controls">
        <div aria-label="Выбор печатной формы" className="ppe-issue-print-form-choice" role="tablist">
          <button aria-selected={mode === "card"} className={mode === "card" ? "is-active" : ""} disabled={exportBusy || printBusy || saving} onClick={() => onModeChange("card")} role="tab" type="button">
            <FileText size={19} />
            <span><strong>Личная карточка</strong><small>Нормативная часть и данные сотрудника</small></span>
            <CheckCircle2 aria-hidden="true" className="ppe-issue-choice-check" size={17} />
          </button>
          <button aria-selected={mode === "sheet"} className={mode === "sheet" ? "is-active" : ""} disabled={exportBusy || printBusy || saving} onClick={() => onModeChange("sheet")} role="tab" type="button">
            <Printer size={19} />
            <span><strong>Лист выдачи</strong><small>Фактически выданные позиции и подписи</small></span>
            <CheckCircle2 aria-hidden="true" className="ppe-issue-choice-check" size={17} />
          </button>
        </div>

        <div className="ppe-issue-export-panel">
          <div><strong>Действия с документом</strong><span>Открывайте крупный просмотр или сразу выгружайте выбранную форму.</span></div>
          <div className="ppe-issue-export-actions">
            <PpeButton disabled={exportBusy || printBusy || saving} onClick={onPreview} variant="primary">Открыть крупно</PpeButton>
            <PpeButton disabled={exportBusy || printBusy || saving} icon={<Printer size={15} />} loading={printBusy} onClick={onPrint} variant="secondary">Печать</PpeButton>
            <PpeButton disabled={exportBusy || printBusy || saving} icon={<FileText size={15} />} loading={downloadFormat === "pdf"} onClick={() => onDownload("pdf")} variant="secondary">PDF</PpeButton>
            <PpeButton disabled={exportBusy || printBusy || saving} icon={<FileText size={15} />} loading={downloadFormat === "docx"} onClick={() => onDownload("docx")} variant="secondary">DOCX</PpeButton>
          </div>
        </div>
      </div>

      <div className="ppe-issue-preview-heading">
        <div><strong>{documentTitle}</strong><span>Экранный предпросмотр печатной формы</span></div>
        <span>Масштабирование доступно в крупном просмотре</span>
      </div>
      <div className="ppe-issue-print-paper-wrap"><PrintPaper data={data} mode={mode} /></div>

      <div className={`ppe-issue-save-panel ${committed ? "is-saved" : hasBlockingErrors ? "is-blocked" : "is-ready"}`}>
        {committed ? <CheckCircle2 size={20} /> : hasBlockingErrors ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <strong>{committed ? "Документ выдачи сохранён" : hasBlockingErrors ? "Сохранение заблокировано" : "Готовы сохранить выдачу?"}</strong>
          <span>{committed ? "Запись добавлена в историю сотрудника." : hasBlockingErrors ? "Исправьте критические ошибки на предыдущих этапах." : "Финальное сохранение создаст все факты выдачи одной операцией."}</span>
        </div>
        <PpeButton disabled={committed || hasBlockingErrors || exportBusy || printBusy} icon={<CheckCircle2 size={16} />} loading={saving} onClick={onSave} variant="primary">{committed ? "Сохранено" : "Сохранить документ выдачи"}</PpeButton>
      </div>
    </section>
  );
}
function SetsStart({ onApply, onRetrySettings, settings, settingsError }: { onApply: (set: InventoryItemSetDetailDto) => Promise<void>; onRetrySettings: () => void; settings: InventorySettingsDto | null; settingsError: string }) {
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
  return <div className="ppe-issue-catalog-start"><div className="ppe-issue-catalog-hero"><Layers3 size={28} /><div><h3>Наборы СИЗ</h3><p>Просмотрите состав перед добавлением. Дублирующиеся товары не создаются повторно.</p></div></div>{error ? <div className="ppe-issue-error" role="alert">{error}</div> : null}{settingsError ? <div className="ppe-issue-error" role="alert"><strong>Наборы недоступны</strong><span>{settingsError}</span><PpeButton icon={<RefreshCw size={15} />} onClick={onRetrySettings} variant="secondary">Повторить</PpeButton></div> : sets.length ? <div className="ppe-issue-set-list">{sets.map((set) => <article key={set.id}><div><strong>{set.name}</strong><span>{set.itemsCount} позиций</span></div><PpeButton disabled={Boolean(loadingId) && loadingId !== set.id} loading={loadingId === set.id} onClick={() => void open(set.id)} variant="secondary">Посмотреть</PpeButton></article>)}</div> : <div className="ppe-issue-empty-inline"><Layers3 size={19} /> Наборы ещё не настроены</div>}{detail ? <section className="ppe-issue-set-preview"><header><div><strong>{detail.name}</strong><span>{detail.items.length} позиций</span></div><PpeButton aria-label="Закрыть состав набора" disabled={saving} onClick={() => setDetail(null)} variant="link">Закрыть</PpeButton></header><ul>{detail.items.map((line) => <li key={line.id}><span><strong>{line.item.name}</strong><small>{[line.item.article, line.item.category].filter(Boolean).join(" · ")}</small></span><b>{line.quantity} {line.item.unit}</b></li>)}</ul><PpeButton loading={saving} onClick={() => void apply()} variant="primary">Добавить набор в выдачу</PpeButton></section> : null}</div>;
}

function CardHeading({ icon, kicker, text, title }: { icon: ReactNode; kicker: string; text?: string; title: string }) { return <div className="ppe-issue-card-heading"><div><span className="ppe-issue-card-kicker">{kicker}</span><h2>{title}</h2>{text ? <p>{text}</p> : null}</div>{icon}</div>; }
function SourceOption({ active, disabled, label, text, onClick }: { active: boolean; disabled?: boolean; label: string; text: string; onClick: () => void }) { return <button className={`${active ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`} disabled={disabled} onClick={onClick} type="button"><span className="ppe-issue-radio">{active ? <Check size={14} /> : null}</span><span><strong>{label}</strong><small>{text}</small></span></button>; }
function Tab({ active, disabled, icon, label, onClick }: { active: boolean; disabled?: boolean; icon?: ReactNode; label: string; onClick: () => void }) { return <button aria-selected={active} className={active ? "is-active" : ""} disabled={disabled} onClick={onClick} role="tab" type="button">{icon}{label}</button>; }
function StatusBadge({ mapped, selected }: { mapped: boolean; selected: boolean }) { const state = !mapped ? "is-warning" : selected ? "is-selected" : "is-ready"; return <span className={`ppe-issue-badge ${state}`}>{!mapped ? "Требует выбора" : selected ? "В документе" : "Готово"}</span>; }
function ProblemBadges({ problems }: { problems: PpeIssueLineProblem[] }) { return problems.length ? <div className="ppe-issue-problems">{problems.map((problem) => <span className={`is-${problem.level}`} key={problem.text}>{problem.text}</span>)}</div> : <span className="ppe-issue-badge is-ready">Готово</span>; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(); }
function detailLabel(field: keyof PpeEmployeeCardDetails) { return ({ clothingSize: "Размер одежды", gender: "Пол", handProtectionSize: "СИЗ рук", headSize: "Размер головного убора", height: "Рост", respiratorSize: "СИЗОД", shoeSize: "Размер обуви" })[field]; }
function detailPlaceholder(field: keyof PpeEmployeeCardDetails) { return field === "gender" ? "муж. / жен." : field === "height" ? "например 176" : "не заполнено"; }
