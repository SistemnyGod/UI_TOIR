import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, FileText, MoreVertical, Printer, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeWorkspaceDto,
  ApplyInventoryPpeLineActionDto,
} from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { formatDate, printDataFromDetail, saveApiFile } from "./ppe/ppeCommon";
import { PrintPaper, PrintPreviewModal, printDocument } from "./ppe/ppePrint";
import type { PrintData, PrintMode } from "./ppe/ppeTypes";
import { PpeCatalogModal, type PpeCatalogSelection } from "./ppe/PpeCatalogModal";
import { PpeIssueModal } from "./ppe/PpeIssueModal";
import { PpeLineActionModal } from "./ppe/PpeLineActionModal";
import { PpeModuleNav } from "./ppe/PpeModuleNav";
import { PpeButton } from "./ppe/PpeUi";

type WorkspaceMode = "norms" | "issued" | "print";

export function InventoryPpeScreen({
  onNavigate = navigateByHash,
  onNotify,
}: {
  cards?: unknown;
  onNavigate?: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onReload?: () => Promise<void>;
  options?: unknown;
}) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [employeePaneCollapsed, setEmployeePaneCollapsed] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [employees, setEmployees] = useState<InventoryEmployeeDto[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => readSelectedEmployee());
  const [workspace, setWorkspace] = useState<InventoryPpeWorkspaceDto | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [mode, setMode] = useState<WorkspaceMode>("norms");
  const [catalogRow, setCatalogRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [issueRow, setIssueRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [issueItem, setIssueItem] = useState<InventoryItemDto | null>(null);
  const [issueSelection, setIssueSelection] = useState<PpeCatalogSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, InventoryItemDto>>({});
  const [previewMode, setPreviewMode] = useState<PrintMode | null>(null);
  const [downloadAction, setDownloadAction] = useState<string | null>(null);
  const downloadActionRef = useRef<string | null>(null);
  const [lineAction, setLineAction] = useState<{ action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setEmployeesLoading(true);
    repository.getEmployees({ page: 1, pageSize: 40, query: deferredQuery, status: "active" })
      .then((result) => {
        if (cancelled) return;
        setEmployees(result.rows);
        if (!selectedEmployeeId && result.rows[0]) selectEmployee(result.rows[0].id);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить сотрудников");
      })
      .finally(() => { if (!cancelled) setEmployeesLoading(false); });
    return () => { cancelled = true; };
  }, [deferredQuery, reloadToken, repository]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    setWorkspaceLoading(true);
    setError("");
    repository.getPpeWorkspace(selectedEmployeeId)
      .then((result) => { if (!cancelled) setWorkspace(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить карточку СИЗ"); })
      .finally(() => { if (!cancelled) setWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken, repository, selectedEmployeeId]);

  const card = workspace?.card ?? null;
  const normRows = useMemo(
    () => [...(workspace?.normRows ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [workspace?.normRows],
  );
  const cardPrintData = useMemo(() => card ? buildPrintData(card, normRows, "card") : null, [card, normRows]);
  const sheetPrintData = useMemo(() => card ? buildPrintData(card, normRows, "sheet") : null, [card, normRows]);
  const previewData = previewMode === "sheet" ? sheetPrintData : cardPrintData;

  function selectEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setEmployeePaneCollapsed(true);
    window.localStorage.setItem("patrol360.inventory.ppe.employee", employeeId);
  }

  async function reloadWorkspace() {
    if (!selectedEmployeeId) return;
    const result = await repository.getPpeWorkspace(selectedEmployeeId);
    setWorkspace(result);
  }

  function retryLoad() {
    setError("");
    setReloadToken((value) => value + 1);
  }

  async function openIssue(row: InventoryPpeCardNormRowDto) {
    let item = row.mappedItemId ? selectedItems[row.mappedItemId] ?? null : null;
    if (!item && row.mappedItemId) {
      const result = await repository.getPpeItems({ pageSize: 30, query: row.mappedItemName });
      item = result.rows.find((candidate) => candidate.id === row.mappedItemId) ?? null;
      if (item) setSelectedItems((current) => ({ ...current, [item!.id]: item! }));
    }
    setIssueItem(item);
    setIssueSelection(item ? {
      item,
      mapping: {
        brandModelArticle: row.brandModelArticle,
        comment: "",
        defaultUnitPriceMinor: row.defaultUnitPriceMinor,
        isDefault: true,
        itemId: item.id,
      },
      quantity: row.quantity || 1,
    } : null);
    setIssueRow(row);
  }

  async function saveMapping(selections: PpeCatalogSelection[]) {
    const selection = selections[0];
    if (!selection) return;
    const { item, mapping } = selection;
    if (!catalogRow || !card) return;
    setSelectedItems((current) => ({ ...current, [item.id]: item }));
    if (issueRow?.id === catalogRow.id) {
      setIssueItem(item);
      setIssueSelection(selection);
    }
    if (catalogRow.sourceNormRowId) {
      await repository.upsertPpeNormRowMapping(catalogRow.sourceNormRowId, mapping);
    }
    await repository.updatePpeCardNormRows(card.id, {
      expectedVersion: card.version ?? 0,
      rows: normRows.map((row) => ({
        brandModelArticle: row.id === catalogRow.id ? mapping.brandModelArticle : row.brandModelArticle,
        defaultUnitPriceMinor: row.id === catalogRow.id ? mapping.defaultUnitPriceMinor : row.defaultUnitPriceMinor,
        id: row.id,
        issuePeriodText: row.issuePeriodText,
        lifeMonths: row.lifeMonths,
        mappedItemId: row.id === catalogRow.id ? item.id : row.mappedItemId,
        normItemName: row.normItemName,
        normPoint: row.normPoint,
        parentRowId: row.parentRowId,
        quantity: row.quantity,
        quantityText: row.quantityText,
        rowType: row.rowType,
        sortOrder: row.sortOrder,
        sourceNormRowId: row.sourceNormRowId,
      })),
    });
    await reloadWorkspace();
    onNotify("Норма сопоставлена с номенклатурой. Фактическая выдача не создана.");
  }

  async function downloadPrint(type: "card" | "sheet", format: "pdf" | "docx") {
    if (!card) return;
    const actionKey = `${type}:${format}`;
    if (downloadActionRef.current) return;
    downloadActionRef.current = actionKey;
    setDownloadAction(actionKey);
    try {
      const file = await repository.printPpeCard(card.id, type, format);
      saveApiFile(file);
      onNotify(`${type === "card" ? "Личная карточка" : "Лист выдачи"} ${format.toUpperCase()} сформирован`);
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : `Не удалось сформировать ${format.toUpperCase()}`);
    } finally {
      downloadActionRef.current = null;
      setDownloadAction(null);
    }
  }

  return (
    <section className="ppe-v2-screen">
      <header className="ppe-v2-page-head">
        <div><span className="ppe-v2-eyebrow">Бухгалтерия / СИЗ</span><h1>Карточки СИЗ</h1><p>Нормы по должности, фактическая выдача и печать документов сотрудника.</p></div>
        <PpeModuleNav active="inventory-ppe" onNavigate={onNavigate} />
      </header>

      <div className="ppe-v2-workspace">
        <aside className={`ppe-v2-employee-pane ${employeePaneCollapsed ? "is-collapsed" : ""}`}>
          <div className="ppe-v2-pane-title">
            <div><strong>Сотрудники</strong><span>{workspace?.employee.fullName || `${employees.length} в выборке`}</span></div>
            <button aria-expanded={!employeePaneCollapsed} aria-label={employeePaneCollapsed ? "Показать список сотрудников" : "Скрыть список сотрудников"} className="ppe-v2-pane-toggle" onClick={() => setEmployeePaneCollapsed((value) => !value)} type="button">
              {employeePaneCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
              {employeePaneCollapsed ? "Выбрать" : "Скрыть"}
            </button>
          </div>
          <label className="ppe-v2-search ppe-v2-employee-search"><Search size={17} /><input aria-label="Поиск сотрудников" onChange={(event) => setQuery(event.target.value)} placeholder="ФИО или табельный номер" value={query} />{query ? <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button"><X size={15} /></button> : null}</label>
          <div className="ppe-v2-employee-list">
            {employeesLoading ? <div className="ppe-v2-state">Загрузка сотрудников…</div> : employees.length === 0 ? <div className="ppe-v2-state"><UserRound size={28} /><strong>Сотрудники не найдены</strong></div> : employees.map((employee) => (
              <button className={selectedEmployeeId === employee.id ? "is-selected" : ""} key={employee.id} onClick={() => selectEmployee(employee.id)} type="button">
                <span className="ppe-v2-avatar">{initials(employee.fullName)}</span>
                <span><strong>{employee.fullName}</strong><small>{employee.personnelNo} · {employee.position}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </aside>

        <main className="ppe-v2-card-pane">
          {workspaceLoading ? <div className="ppe-v2-state ppe-v2-state-large">Загрузка карточки сотрудника…</div> : error ? <div className="ppe-v2-state ppe-v2-state-large"><AlertTriangle size={32} /><strong>Не удалось открыть СИЗ</strong><span>{error}</span><PpeButton icon={<RefreshCw size={16} />} onClick={retryLoad} variant="secondary">Повторить</PpeButton></div> : !workspace ? <div className="ppe-v2-state ppe-v2-state-large"><UserRound size={32} /><strong>Выберите сотрудника</strong><span>Справа откроются нормы, выдача и печать.</span></div> : (
            <>
              <EmployeeHeader onCreateIssue={() => onNavigate("inventory-ppe-create")} workspace={workspace} />
              {!card ? (
                <div className="ppe-v2-state ppe-v2-state-large"><FileText size={34} /><strong>У сотрудника нет карточки СИЗ</strong><span>Создайте карточку из действующих норм, предыдущей карточки или пустого шаблона.</span><PpeButton onClick={() => onNavigate("inventory-ppe-create")} variant="primary">Создать карточку</PpeButton></div>
              ) : (
                <>
                  <div aria-label="Рабочие разделы карточки СИЗ" className="ppe-v2-mode-tabs" role="tablist">
                    <button aria-selected={mode === "norms"} className={mode === "norms" ? "is-active" : ""} onClick={() => setMode("norms")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Нормы</strong><small>Что положено сотруднику</small></span><b>{workspace.normsTotal}</b></button>
                    <button aria-selected={mode === "issued"} className={mode === "issued" ? "is-active" : ""} onClick={() => setMode("issued")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Фактическая выдача</strong><small>Выдано, возвращено, списано</small></span><b>{card.lines.filter((line) => line.status !== "archived").length}</b></button>
                    <button aria-selected={mode === "print"} className={mode === "print" ? "is-active" : ""} onClick={() => setMode("print")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Печать</strong><small>Карточка и лист выдачи</small></span></button>
                  </div>
                  {mode === "norms" ? <NormRowsTable rows={normRows} onIssue={(row) => void openIssue(row)} onMap={setCatalogRow} /> : null}
                  {mode === "issued" ? <IssuedTable card={card} onAction={(line, action) => setLineAction({ action, line })} /> : null}
                  {mode === "print" && cardPrintData && sheetPrintData ? <PrintWorkspace cardData={cardPrintData} sheetData={sheetPrintData} downloadAction={downloadAction} onDownload={downloadPrint} onPreview={setPreviewMode} /> : null}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {catalogRow ? <PpeCatalogModal normRow={catalogRow} onClose={() => setCatalogRow(null)} onConfirm={saveMapping} /> : null}
      {issueRow && card ? (
        <PpeIssueModal
          initialBrandModelArticle={issueSelection?.mapping.brandModelArticle ?? issueRow.brandModelArticle}
          initialQuantity={issueSelection?.quantity ?? issueRow.quantity}
          initialUnitPriceMinor={issueSelection?.mapping.defaultUnitPriceMinor ?? issueRow.defaultUnitPriceMinor}
          item={issueItem}
          normRow={issueRow}
          onChooseItem={() => setCatalogRow(issueRow)}
          onClose={() => { setIssueRow(null); setIssueSelection(null); }}
          onSubmit={async (payload) => {
            await repository.createPpeIssue(card.id, { ...payload, expectedVersion: card.version });
            await reloadWorkspace();
            setMode("issued");
            onNotify("СИЗ выдано. Запись добавлена в историю и лист выдачи.");
          }}
        />
      ) : null}
      {previewMode && previewData ? <PrintPreviewModal data={previewData} mode={previewMode} onClose={() => setPreviewMode(null)} onModeChange={setPreviewMode} onPrint={printDocument} /> : null}
      {lineAction && card ? <PpeLineActionModal action={lineAction.action} line={lineAction.line} onClose={() => setLineAction(null)} onSubmit={async (payload) => { await repository.applyPpeLineAction(card.id, lineAction.line.id, { ...payload, expectedVersion: card.version }); await reloadWorkspace(); onNotify("Операция сохранена в истории СИЗ"); }} /> : null}
    </section>
  );
}

function EmployeeHeader({ onCreateIssue, workspace }: { onCreateIssue: () => void; workspace: InventoryPpeWorkspaceDto }) {
  const { employee, card } = workspace;
  return (
    <section className="ppe-v2-employee-head">
      <div className="ppe-v2-employee-main">
        <div className="ppe-v2-employee-identity"><span className="ppe-v2-avatar is-large">{initials(employee.fullName)}</span><div><span className="ppe-v2-eyebrow">Личная карточка сотрудника</span><h2>{employee.fullName}</h2><p>{employee.position} · {employee.department}</p></div></div>
        <PpeButton icon={<FileText size={16} />} onClick={onCreateIssue} size="touch" variant="primary">Оформить выдачу</PpeButton>
      </div>
      <dl className="ppe-v2-employee-meta"><div><dt>Табельный номер</dt><dd>{employee.personnelNo || "Не указан"}</dd></div><div><dt>Дата карточки</dt><dd>{card ? formatDate(card.createdAt) : "Нет карточки"}</dd></div></dl>
      <div className={"ppe-v2-norm-context " + (workspace.activeNormSet ? "is-ready" : "is-missing")}>
        <ShieldCheck size={18} />
        <div><strong>{workspace.activeNormSet ? "Применяются нормы должности" : "Опубликованные нормы не найдены"}</strong><span>{workspace.activeNormSet ? workspace.activeNormSet.positionName + " · версия " + workspace.activeNormSet.versionName + " · " + workspace.activeNormSet.sourceName : "Должность: " + employee.position + ". Карточку можно вести вручную, но нормативный источник не подтверждён."}</span></div>
      </div>
      <div className="ppe-v2-kpis">
        <Kpi label="Нормы" value={workspace.normsTotal} />
        <Kpi label="Выдано" tone="good" value={workspace.issued} />
        <Kpi label="Не выдано" tone="muted" value={workspace.notIssued} />
        <Kpi label="Частично" tone="warn" value={workspace.partial} />
        <Kpi label="Просрочено" tone="danger" value={workspace.overdue} />
        <Kpi label="Ошибки" tone="danger" value={workspace.errors} />
      </div>
    </section>
  );
}
function Kpi({ label, tone = "", value }: { label: string; tone?: string; value: number }) {
  return <span className={tone ? `is-${tone}` : ""}><small>{label}</small><strong>{value}</strong></span>;
}

function NormRowsTable({ rows, onIssue, onMap }: { rows: InventoryPpeCardNormRowDto[]; onIssue: (row: InventoryPpeCardNormRowDto) => void; onMap: (row: InventoryPpeCardNormRowDto) => void }) {
  const itemRows = rows.filter((row) => row.rowType !== "group");
  const mapped = itemRows.filter((row) => row.mappedItemId).length;
  const needMapping = itemRows.length - mapped;
  const attention = itemRows.filter((row) => row.coverageStatus === "overdue" || row.coverageStatus === "partial").length;
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>В карточке нет строк норм</strong><span>Добавьте нормы вручную или создайте карточку из опубликованного набора должности.</span></div>;
  return (
    <section className="ppe-v2-work-section">
      <header className="ppe-v2-work-section-head"><div><span className="ppe-v2-eyebrow">Нормативная часть</span><h3>Положено сотруднику по норме</h3><p>Конкретная номенклатура выбирается отдельно и не изменяет нормативное наименование.</p></div><div className="ppe-v2-section-counters"><span><strong>{itemRows.length}</strong><small>позиций</small></span><span className="is-ready"><strong>{mapped}</strong><small>сопоставлено</small></span><span className={needMapping ? "is-warning" : "is-ready"}><strong>{needMapping}</strong><small>требуют выбора</small></span><span className={attention ? "is-danger" : ""}><strong>{attention}</strong><small>требуют внимания</small></span></div></header>
      <div className="ppe-v2-table-wrap">
        <table className="ppe-v2-table ppe-v2-norm-table ppe-v2-responsive-table"><thead><tr><th>Наименование СИЗ</th><th>Пункт норм</th><th>Периодичность</th><th>Количество</th><th>Номенклатура</th><th>Покрытие</th><th aria-label="Действия" /></tr></thead>
          <tbody>{rows.map((row) => row.rowType === "group" ? <tr className="ppe-v2-group-row" key={row.id}><th colSpan={7}>{row.normItemName}</th></tr> : (
            <tr className={`is-${row.coverageStatus} ${row.mappedItemId ? "is-mapped" : "is-unmapped"}`} key={row.id}><td data-label="СИЗ"><strong>{row.normItemName}</strong></td><td data-label="Пункт норм">{row.normPoint || "—"}</td><td data-label="Периодичность">{row.issuePeriodText || "—"}</td><td data-label="Количество">{row.quantityText || row.quantity}</td><td data-label="Номенклатура"><button className={`ppe-v2-link-button ${row.mappedItemId ? "is-selected" : "is-required"}`} onClick={() => onMap(row)} type="button">{row.mappedItemName || "Выбрать номенклатуру"}</button>{row.mappings.length > 1 ? <small>Допустимых вариантов: {row.mappings.length}</small> : row.brandModelArticle ? <small>{row.brandModelArticle}</small> : <small>Связь с товаром ещё не задана</small>}</td><td data-label="Покрытие"><Coverage status={row.coverageStatus} /></td><td className="ppe-v2-actions-cell"><PpeButton className="ppe-v2-row-action" onClick={() => onIssue(row)} size="compact" variant={row.mappedItemId ? "primary" : "secondary"}>{row.mappedItemId ? "Выдать" : "Подобрать и выдать"}</PpeButton></td></tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
function Coverage({ status }: { status: InventoryPpeCardNormRowDto["coverageStatus"] }) {
  const labels = { issued: "Выдано", not_issued: "Не выдано", overdue: "Просрочено", partial: "Частично" };
  return <span className={`ppe-v2-status is-${status}`}>{status === "issued" ? <CheckCircle2 size={14} /> : null}{labels[status]}</span>;
}

function IssuedTable({ card, onAction }: { card: InventoryPpeCardDetailDto; onAction: (line: InventoryPpeCardLineDto, action: ApplyInventoryPpeLineActionDto["action"]) => void }) {
  const rows = [...card.lines].filter((line) => line.status !== "archived").sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));
  const active = rows.filter((line) => line.status === "issued" || line.status === "defective").length;
  const returned = rows.filter((line) => line.status === "returned").length;
  const writtenOff = rows.filter((line) => line.status === "written_off").length;
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>Фактов выдачи пока нет</strong><span>Нормы остаются в личной карточке, лист выдачи пуст.</span></div>;
  return (
    <section className="ppe-v2-work-section">
      <header className="ppe-v2-work-section-head"><div><span className="ppe-v2-eyebrow">Фактическая выдача</span><h3>Что сотрудник получил</h3><p>Операции отсортированы от новой даты к старой. Завершённые строки нельзя провести повторно.</p></div><div className="ppe-v2-section-counters"><span><strong>{rows.length}</strong><small>всего</small></span><span className="is-ready"><strong>{active}</strong><small>на руках</small></span><span><strong>{returned}</strong><small>возвращено</small></span><span><strong>{writtenOff}</strong><small>списано</small></span></div></header>
      <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-responsive-table"><thead><tr><th>СИЗ</th><th>Модель / артикул</th><th>Дата выдачи</th><th>Количество</th><th>Способ</th><th>Статус</th><th aria-label="Действия" /></tr></thead><tbody>{rows.map((line) => {
        const actions = availableLineActions(line.status);
        return <tr className={`is-${line.status}`} key={line.id}><td data-label="СИЗ"><strong>{line.printItemName || line.itemName}</strong>{line.printItemName && line.printItemName !== line.itemName ? <small>{line.itemName}</small> : null}</td><td data-label="Модель / артикул">{line.brandModelArticle || "Не указано"}</td><td data-label="Дата выдачи">{formatDate(line.issuedAt)}</td><td data-label="Количество">{line.quantity} {line.unit}</td><td data-label="Способ">{line.issueMethod === "dispenser" ? "Дозатор" : "Лично"}</td><td data-label="Статус"><span className={`ppe-v2-status is-${line.status}`}>{issueStatusLabel(line.status)}</span></td><td className="ppe-v2-actions-cell">{actions.length ? <details className="ppe-v2-row-menu"><summary aria-label={`Действия: ${line.printItemName || line.itemName}`}><MoreVertical size={18} /></summary><div>{actions.map((action) => <button className={action === "written_off" || action === "defective" ? "is-danger" : ""} key={action} onClick={() => onAction(line, action)} type="button">{lineActionLabel(action)}</button>)}</div></details> : <span className="ppe-v2-row-closed">Операция завершена</span>}</td></tr>;
      })}</tbody></table></div>
    </section>
  );
}

function availableLineActions(status: string): ApplyInventoryPpeLineActionDto["action"][] {
  if (status === "issued") return ["returned", "written_off", "defective"];
  if (status === "defective") return ["returned", "written_off"];
  return [];
}

function lineActionLabel(action: ApplyInventoryPpeLineActionDto["action"]) {
  return ({ defective: "Отметить неисправным", returned: "Оформить возврат", written_off: "Оформить списание" })[action];
}
function PrintWorkspace({ cardData, downloadAction, onDownload, onPreview, sheetData }: { cardData: PrintData; downloadAction: string | null; onDownload: (type: "card" | "sheet", format: "pdf" | "docx") => Promise<void>; onPreview: (mode: PrintMode) => void; sheetData: PrintData }) {
  const exportButton = (type: "card" | "sheet", format: "pdf" | "docx", label: string) => {
    const actionKey = `${type}:${format}`;
    return <PpeButton disabled={Boolean(downloadAction && downloadAction !== actionKey)} icon={format === "pdf" ? <FileText size={16} /> : <Printer size={16} />} loading={downloadAction === actionKey} onClick={() => void onDownload(type, format)} variant="primary">{label}</PpeButton>;
  };

  return <div className="ppe-v2-print-grid">
    <article>
      <header><FileText size={20} /><div><strong>Личная карточка СИЗ</strong><span>Нормы и группы в нормативном порядке</span></div></header>
      <div className="ppe-v2-print-preview"><PrintPaper data={cardData} mode="card" /></div>
      <footer><PpeButton onClick={() => onPreview("card")} variant="secondary">Предпросмотр</PpeButton>{exportButton("card", "pdf", "PDF")}{exportButton("card", "docx", "DOCX")}</footer>
    </article>
    <article>
      <header><Printer size={20} /><div><strong>Лист выдачи</strong><span>Фактические выдачи по дате с местом для подписи</span></div></header>
      <div className="ppe-v2-print-preview"><PrintPaper data={sheetData} mode="sheet" /></div>
      <footer><PpeButton onClick={() => onPreview("sheet")} variant="secondary">Предпросмотр</PpeButton>{exportButton("sheet", "pdf", "PDF")}{exportButton("sheet", "docx", "DOCX")}</footer>
    </article>
  </div>;
}

function buildPrintData(card: InventoryPpeCardDetailDto, normRows: InventoryPpeCardNormRowDto[], mode: PrintMode) {
  if (mode === "sheet") return printDataFromDetail(card);
  const factsByNorm = new Map(card.lines.filter((line) => line.cardNormRowId).map((line) => [line.cardNormRowId!, line]));
  const lines: InventoryPpeCardLineDto[] = normRows.map((row) => {
    const fact = factsByNorm.get(row.id);
    return {
      amountMinor: fact?.amountMinor ?? 0,
      brandModelArticle: fact?.brandModelArticle ?? row.brandModelArticle,
      cardNormRowId: row.id,
      dueAt: fact?.dueAt ?? null,
      id: fact?.id ?? `norm-${row.id}`,
      isSectionTitle: row.rowType === "group",
      issuedAt: fact?.issuedAt ?? null,
      issuePeriodText: row.issuePeriodText,
      itemId: fact?.itemId ?? row.mappedItemId ?? "",
      itemName: fact?.itemName ?? row.mappedItemName ?? row.normItemName,
      modelDescription: fact?.modelDescription ?? row.brandModelArticle,
      normPoint: row.normPoint,
      printItemName: row.normItemName,
      quantity: row.quantity,
      quantityText: row.quantityText,
      status: row.rowType === "group" ? "section" : fact?.status ?? "not_issued",
      unit: fact?.unit ?? "шт.",
      unitPriceMinor: fact?.unitPriceMinor ?? row.defaultUnitPriceMinor ?? 0,
      warehouseId: fact?.warehouseId ?? null,
      warehouseName: fact?.warehouseName ?? "",
    };
  });
  return printDataFromDetail({ ...card, lines });
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function readSelectedEmployee() { return typeof window === "undefined" ? "" : window.localStorage.getItem("patrol360.inventory.ppe.employee") ?? ""; }
function issueStatusLabel(status: string) { return ({ defective: "Неисправно", issued: "Выдано", returned: "Возвращено", written_off: "Списано" } as Record<string, string>)[status] ?? status; }
function navigateByHash(screen: ScreenId) { window.location.hash = screen; }
