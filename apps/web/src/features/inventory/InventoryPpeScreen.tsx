import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, FileText, MoreVertical, Printer, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeWorkspaceDto,
  ApplyInventoryPpeLineActionDto,
  UpsertInventoryPpeNormMappingDto,
} from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { formatDate, printDataFromDetail, saveApiFile } from "./ppe/ppeCommon";
import { PrintPaper, PrintPreviewModal, printDocument } from "./ppe/ppePrint";
import type { PrintData, PrintMode } from "./ppe/ppeTypes";
import { PpeCatalogModal } from "./ppe/PpeCatalogModal";
import { PpeIssueModal } from "./ppe/PpeIssueModal";
import { PpeLineActionModal } from "./ppe/PpeLineActionModal";
import { PpeModuleNav } from "./ppe/PpeModuleNav";

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
  const [mode, setMode] = useState<WorkspaceMode>("norms");
  const [catalogRow, setCatalogRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [issueRow, setIssueRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [issueItem, setIssueItem] = useState<InventoryItemDto | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, InventoryItemDto>>({});
  const [previewMode, setPreviewMode] = useState<PrintMode | null>(null);
  const [lineAction, setLineAction] = useState<{ action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto } | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, [deferredQuery, repository]);

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
  }, [repository, selectedEmployeeId]);

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

  async function openIssue(row: InventoryPpeCardNormRowDto) {
    let item = row.mappedItemId ? selectedItems[row.mappedItemId] ?? null : null;
    if (!item && row.mappedItemId) {
      const result = await repository.getPpeItems({ pageSize: 30, query: row.mappedItemName });
      item = result.rows.find((candidate) => candidate.id === row.mappedItemId) ?? null;
      if (item) setSelectedItems((current) => ({ ...current, [item!.id]: item! }));
    }
    setIssueItem(item);
    setIssueRow(row);
  }

  async function saveMapping(item: InventoryItemDto, mapping: UpsertInventoryPpeNormMappingDto) {
    if (!catalogRow || !card) return;
    setSelectedItems((current) => ({ ...current, [item.id]: item }));
    if (issueRow?.id === catalogRow.id) setIssueItem(item);
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

  async function downloadDocx(type: "card" | "sheet") {
    if (!card) return;
    const file = await repository.printPpeCard(card.id, type, "docx");
    saveApiFile(file);
    onNotify(type === "card" ? "Личная карточка DOCX сформирована" : "Лист подписи DOCX сформирован");
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
          {workspaceLoading ? <div className="ppe-v2-state ppe-v2-state-large">Загрузка карточки сотрудника…</div> : error ? <div className="ppe-v2-state ppe-v2-state-large"><AlertTriangle size={32} /><strong>Не удалось открыть СИЗ</strong><span>{error}</span></div> : !workspace ? <div className="ppe-v2-state ppe-v2-state-large"><UserRound size={32} /><strong>Выберите сотрудника</strong><span>Справа откроются нормы, выдача и печать.</span></div> : (
            <>
              <EmployeeHeader workspace={workspace} />
              {!card ? (
                <div className="ppe-v2-state ppe-v2-state-large"><FileText size={34} /><strong>У сотрудника нет карточки СИЗ</strong><span>Создайте карточку из действующих норм, предыдущей карточки или пустого шаблона.</span><button className="button primary" onClick={() => onNavigate("inventory-ppe-create")} type="button">Создать карточку</button></div>
              ) : (
                <>
                  <div className="ppe-v2-mode-tabs" role="tablist">
                    <button className={mode === "norms" ? "is-active" : ""} onClick={() => setMode("norms")} type="button">Нормы <span>{workspace.normsTotal}</span></button>
                    <button className={mode === "issued" ? "is-active" : ""} onClick={() => setMode("issued")} type="button">Выдано <span>{card.lines.filter((line) => line.status !== "archived").length}</span></button>
                    <button className={mode === "print" ? "is-active" : ""} onClick={() => setMode("print")} type="button">Печать</button>
                  </div>
                  {mode === "norms" ? <NormRowsTable rows={normRows} onIssue={(row) => void openIssue(row)} onMap={setCatalogRow} /> : null}
                  {mode === "issued" ? <IssuedTable card={card} onAction={(line, action) => setLineAction({ action, line })} /> : null}
                  {mode === "print" && cardPrintData && sheetPrintData ? <PrintWorkspace cardData={cardPrintData} sheetData={sheetPrintData} onDownload={downloadDocx} onPreview={setPreviewMode} /> : null}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {catalogRow ? <PpeCatalogModal normRow={catalogRow} onClose={() => setCatalogRow(null)} onConfirm={saveMapping} /> : null}
      {issueRow && card ? <PpeIssueModal item={issueItem} normRow={issueRow} onChooseItem={() => setCatalogRow(issueRow)} onClose={() => setIssueRow(null)} onSubmit={async (payload) => { await repository.createPpeIssue(card.id, { ...payload, expectedVersion: card.version }); await reloadWorkspace(); setMode("issued"); onNotify("СИЗ выдано. Запись добавлена в историю и лист подписи."); }} /> : null}
      {previewMode && previewData ? <PrintPreviewModal data={previewData} mode={previewMode} onClose={() => setPreviewMode(null)} onModeChange={setPreviewMode} onPrint={printDocument} /> : null}
      {lineAction && card ? <PpeLineActionModal action={lineAction.action} line={lineAction.line} onClose={() => setLineAction(null)} onSubmit={async (payload) => { await repository.applyPpeLineAction(card.id, lineAction.line.id, { ...payload, expectedVersion: card.version }); await reloadWorkspace(); onNotify("Операция сохранена в истории СИЗ"); }} /> : null}
    </section>
  );
}

function EmployeeHeader({ workspace }: { workspace: InventoryPpeWorkspaceDto }) {
  const { employee, card } = workspace;
  return (
    <section className="ppe-v2-employee-head">
      <div className="ppe-v2-employee-identity"><span className="ppe-v2-avatar is-large">{initials(employee.fullName)}</span><div><span className="ppe-v2-eyebrow">Личная карточка сотрудника</span><h2>{employee.fullName}</h2><p>{employee.position} · {employee.department}</p></div></div>
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
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>В карточке нет строк норм</strong><span>Добавьте нормы вручную или создайте карточку из опубликованного набора должности.</span></div>;
  return (
    <div className="ppe-v2-table-wrap">
      <table className="ppe-v2-table ppe-v2-norm-table ppe-v2-responsive-table"><thead><tr><th>Наименование СИЗ</th><th>Пункт норм</th><th>Периодичность</th><th>Количество</th><th>Номенклатура</th><th>Покрытие</th><th aria-label="Действия" /></tr></thead>
        <tbody>{rows.map((row) => row.rowType === "group" ? <tr className="ppe-v2-group-row" key={row.id}><th colSpan={7}>{row.normItemName}</th></tr> : (
          <tr key={row.id}><td data-label="СИЗ"><strong>{row.normItemName}</strong></td><td data-label="Пункт норм">{row.normPoint || "—"}</td><td data-label="Периодичность">{row.issuePeriodText || "—"}</td><td data-label="Количество">{row.quantityText || row.quantity}</td><td data-label="Номенклатура"><button className="ppe-v2-link-button" onClick={() => onMap(row)} type="button">{row.mappedItemName || "Выбрать по норме"}</button>{row.mappings.length > 1 ? <small>Допустимых вариантов: {row.mappings.length}</small> : row.brandModelArticle ? <small>{row.brandModelArticle}</small> : null}</td><td data-label="Покрытие"><Coverage status={row.coverageStatus} /></td><td className="ppe-v2-actions-cell"><button className="button primary ppe-v2-row-action" onClick={() => onIssue(row)} type="button">Выдать</button></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Coverage({ status }: { status: InventoryPpeCardNormRowDto["coverageStatus"] }) {
  const labels = { issued: "Выдано", not_issued: "Не выдано", overdue: "Просрочено", partial: "Частично" };
  return <span className={`ppe-v2-status is-${status}`}>{status === "issued" ? <CheckCircle2 size={14} /> : null}{labels[status]}</span>;
}

function IssuedTable({ card, onAction }: { card: InventoryPpeCardDetailDto; onAction: (line: InventoryPpeCardLineDto, action: ApplyInventoryPpeLineActionDto["action"]) => void }) {
  const rows = [...card.lines].filter((line) => line.status !== "archived").sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>Фактов выдачи пока нет</strong><span>Нормы остаются в личной карточке, лист подписи пуст.</span></div>;
  return <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-responsive-table"><thead><tr><th>СИЗ</th><th>Модель / артикул</th><th>Дата</th><th>Количество</th><th>Способ</th><th>Статус</th><th /></tr></thead><tbody>{rows.map((line) => <tr key={line.id}><td data-label="СИЗ"><strong>{line.printItemName || line.itemName}</strong><small>{line.itemName}</small></td><td data-label="Модель / артикул">{line.brandModelArticle || "—"}</td><td data-label="Дата">{formatDate(line.issuedAt)}</td><td data-label="Количество">{line.quantity} {line.unit}</td><td data-label="Способ">{line.issueMethod === "dispenser" ? "Дозатор" : "Лично"}</td><td data-label="Статус"><span className={`ppe-v2-status is-${line.status}`}>{issueStatusLabel(line.status)}</span></td><td className="ppe-v2-actions-cell"><details className="ppe-v2-row-menu"><summary aria-label="Действия"><MoreVertical size={18} /></summary><div><button onClick={() => onAction(line, "returned")} type="button">Оформить возврат</button><button onClick={() => onAction(line, "written_off")} type="button">Оформить списание</button><button onClick={() => onAction(line, "defective")} type="button">Отметить неисправным</button></div></details></td></tr>)}</tbody></table></div>;
}

function PrintWorkspace({ cardData, sheetData, onDownload, onPreview }: { cardData: PrintData; sheetData: PrintData; onDownload: (type: "card" | "sheet") => Promise<void>; onPreview: (mode: PrintMode) => void }) {
  return <div className="ppe-v2-print-grid"><article><header><FileText size={20} /><div><strong>Личная карточка СИЗ</strong><span>Нормы и группы в нормативном порядке</span></div></header><div className="ppe-v2-print-preview"><PrintPaper data={cardData} mode="card" /></div><footer><button className="button" onClick={() => onPreview("card")} type="button">Предпросмотр</button><button className="button primary" onClick={() => void onDownload("card")} type="button"><Printer size={16} /> DOCX</button></footer></article><article><header><CircleDollarSign size={20} /><div><strong>Лист подписи</strong><span>Только фактические выдачи по дате</span></div></header><div className="ppe-v2-print-preview"><PrintPaper data={sheetData} mode="sheet" /></div><footer><button className="button" onClick={() => onPreview("sheet")} type="button">Предпросмотр</button><button className="button primary" onClick={() => void onDownload("sheet")} type="button"><Printer size={16} /> DOCX</button></footer></article></div>;
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
