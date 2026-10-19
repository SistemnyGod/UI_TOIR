import { readDocumentStorage, writeDocumentStorage } from "./ppe/documentStorage";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, FileText, MoreVertical, Printer, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type {
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeWorkspaceDto,
  ApplyInventoryPpeLineActionDto,
} from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { formatDate, printDataFromDetail, saveApiFile } from "./ppe/ppeCommon";
import { PrintPaper, printDocument } from "./ppe/ppePrint";
import { LegacyPrintPreview } from "./ppe/LegacyPrintPreview";
import type { PrintData, PrintMode } from "./ppe/ppeTypes";
import { PpeLineActionModal } from "./ppe/PpeLineActionModal";
import { PpeModuleNav } from "./ppe/PpeModuleNav";
import { PpeButton } from "./ppe/PpeUi";
import { savePpeNormSettingsIntent } from "./ppe/ppeNormSettingsIntent";
import { usePhoneLayout } from "../../hooks/usePhoneLayout";
import { PhoneDisclosure } from "../../shared/ui/PhoneDisclosure";
import { ppeErrorMessage } from "./ppe/ppeErrors";
import { usePpeEmployeeSearch } from "./ppe/usePpeEmployeeSearch";

type WorkspaceMode = "norms" | "issued" | "print";

type PpeWorkspaceProps = {
  currentUserId?: string; canManage?: boolean; canExport?: boolean; cards?: unknown; onNavigate?: (screen: ScreenId) => void;
  onNotify: (message: string) => void; onReload?: () => Promise<void>; options?: unknown;
};
export function InventoryPpeScreen(props: PpeWorkspaceProps) {
  const repository = useInventoryRepository(), owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <PpeCardWorkspace key={(props.currentUserId ?? "anonymous") + ":" + owner.current.revision} {...props} />;
}
function PpeCardWorkspace({
  onNavigate = navigateByHash,
  onNotify, canManage = false, canExport = false, currentUserId = "anonymous",
}: PpeWorkspaceProps) {
  const repository = useInventoryRepository();
  const phoneLayout = usePhoneLayout("(max-width: 767px)");
  const [employeePaneCollapsed, setEmployeePaneCollapsed] = useState(phoneLayout);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => readSelectedEmployee(currentUserId));
  const employeeSearch = usePpeEmployeeSearch(repository, currentUserId, selectedEmployeeId);
  const { employees, query, loading: employeesLoading, error: employeesError } = employeeSearch;
  const [workspace, setWorkspace] = useState<InventoryPpeWorkspaceDto | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [mode, setMode] = useState<WorkspaceMode>("norms");
  const [previewMode, setPreviewMode] = useState<PrintMode | null>(null);
  const [downloadAction, setDownloadAction] = useState<string | null>(null);
  const downloadActionRef = useRef<string | null>(null);
  const ownerVersionRef = useRef(0);
  useEffect(() => () => { ownerVersionRef.current += 1; workspaceRequest.current++; }, [selectedEmployeeId, repository]);
  const workspaceRequest = useRef(0);
  const selectedRef = useRef(selectedEmployeeId);
  selectedRef.current = selectedEmployeeId;
  const [lineAction, setLineAction] = useState<{ action: ApplyInventoryPpeLineActionDto["action"]; line: InventoryPpeCardLineDto; cardId: string; version?: number } | null>(null);

  useEffect(() => {
    if (!selectedRef.current && employeeSearch.rows[0]) selectEmployee(employeeSearch.rows[0].id, false);
  }, [employeeSearch.rows]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    const generation = ++workspaceRequest.current;
    setWorkspaceLoading(true);
    setError("");
    repository.getPpeWorkspace(selectedEmployeeId)
      .then((result) => { if (!cancelled && generation === workspaceRequest.current) { if (result.employee.id !== selectedEmployeeId) throw new Error("Сервер вернул карточку другого сотрудника. Повторите загрузку."); setWorkspace(result); setRefreshRequired(false); } })
      .catch((reason) => { if (!cancelled && generation === workspaceRequest.current) { setRefreshRequired(true); setError(reason instanceof Error ? reason.message : "Не удалось загрузить карточку СИЗ"); } })
      .finally(() => { if (!cancelled && generation === workspaceRequest.current) setWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken, repository, selectedEmployeeId]);

  const card = workspace?.card ?? null;
  const normRows = useMemo(
    () => [...(workspace?.normRows ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [workspace?.normRows],
  );
  const cardPrintData = useMemo(() => card ? buildPrintData(card, normRows, "card") : null, [card, normRows]);
  const sheetPrintData = useMemo(() => card ? buildPrintData(card, normRows, "sheet") : null, [card, normRows]);

  function selectEmployee(employeeId: string, collapsePane = true) {
    if (employeeId === selectedEmployeeId) { if (collapsePane) setEmployeePaneCollapsed(true); return; }
    workspaceRequest.current++;
    setWorkspace(null); setLineAction(null); setPreviewMode(null); setRefreshRequired(false); setError("");
    downloadActionRef.current = null; setDownloadAction(null);
    setSelectedEmployeeId(employeeId);
    if (collapsePane) setEmployeePaneCollapsed(true);
    const key = employeeStorageKey(currentUserId); if (key) writeDocumentStorage("localStorage", key, employeeId);
  }

  async function reloadWorkspace() {
    if (!selectedEmployeeId) return;
    const generation = ++workspaceRequest.current;
    const result = await repository.getPpeWorkspace(selectedEmployeeId);
    if (generation === workspaceRequest.current && selectedRef.current === selectedEmployeeId) {
      if (result.employee.id !== selectedEmployeeId) throw new Error("Сервер вернул карточку другого сотрудника.");
      setWorkspace(result); setRefreshRequired(false); setError("");
    }
  }

  async function applyLineAction(payload: ApplyInventoryPpeLineActionDto) {
    if (!lineAction || refreshRequired || workspaceLoading) throw new Error("Сначала обновите карточку сотрудника.");
    const owner = ownerVersionRef.current;
    await repository.applyPpeLineAction(lineAction.cardId, lineAction.line.id, { ...payload, expectedVersion: lineAction.version });
    if (owner !== ownerVersionRef.current) return;
    setRefreshRequired(true);
    try { await reloadWorkspace(); }
    catch (reason) {
      if (owner !== ownerVersionRef.current) return;
      setError("Операция сохранена в истории СИЗ. Карточку не удалось обновить: " + ppeErrorMessage(reason, "Нет связи с сервером") + ". Обновите карточку; повторять операцию не нужно.");
      onNotify("Операция сохранена. Для следующих действий обновите карточку СИЗ.");
      return;
    }
    if (owner === ownerVersionRef.current) onNotify("Операция сохранена в истории СИЗ");
  }

  function retryLoad() {
    setError("");
    setReloadToken((value) => value + 1);
  }

  async function downloadPrint(type: "card" | "sheet", format: "pdf" | "docx") {
    if (!card || !canExport) return;
    const owner = ownerVersionRef.current;
    const actionKey = `${type}:${format}`;
    if (downloadActionRef.current) return;
    downloadActionRef.current = actionKey;
    setDownloadAction(actionKey);
    try {
      const file = await repository.printPpeCard(card.id, type, format);
      if (owner !== ownerVersionRef.current) return;
      saveApiFile(file);
      onNotify(`${type === "card" ? "Личная карточка" : "Лист выдачи"} ${format.toUpperCase()} сформирован`);
    } catch (reason) {
      if (owner === ownerVersionRef.current) onNotify(ppeErrorMessage(reason, `Не удалось сформировать ${format.toUpperCase()}`));
    } finally {
      if (owner === ownerVersionRef.current) { downloadActionRef.current = null; setDownloadAction(null); }
    }
  }

  return (
    <section className="ppe-v2-screen">
      <header className="ppe-v2-page-head">
        <div><h1>Средства защиты</h1><p>Нормы, выдача и документы сотрудников</p></div>
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
          <label className="ppe-v2-search ppe-v2-employee-search"><Search size={17} /><input aria-label="Поиск сотрудников" onChange={(event) => employeeSearch.search(event.target.value)} placeholder="ФИО или табельный номер" value={query} />{query ? <button aria-label="Очистить поиск" onClick={() => employeeSearch.search("")} type="button"><X size={15} /></button> : null}</label>
          <div className="ppe-v2-employee-list">
            {employeesError ? <div className="ppe-workspace-refresh-error" role="alert"><span>{employeesError}</span><PpeButton disabled={employeesLoading} onClick={employeeSearch.retry}>Повторить поиск</PpeButton></div> : null}
            {employeesLoading ? <div className="ppe-v2-state" role="status">{employees.length ? "Обновление сотрудников…" : "Загрузка сотрудников…"}</div> : null}
            {!employeesLoading && employees.length === 0 ? <div className="ppe-v2-state"><UserRound size={28} /><strong>Сотрудники не найдены</strong></div> : employees.map((employee) => (
              <button className={selectedEmployeeId === employee.id ? "is-selected" : ""} key={employee.id} onClick={(event) => {
                const toggle = event.currentTarget.closest("aside")?.querySelector<HTMLButtonElement>(".ppe-v2-pane-toggle");
                selectEmployee(employee.id);
                if (phoneLayout) toggle?.focus();
              }} type="button">
                <span className="ppe-v2-avatar">{initials(employee.fullName)}</span>
                <span><strong>{employee.fullName}</strong><small>{employee.personnelNo} · {employee.position}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <div className="ppe-card-employee-pages"><span>В поиске: {employeeSearch.rows.length} из {employeeSearch.total}</span>{employeeSearch.hasMore ? <PpeButton disabled={employeesLoading} onClick={employeeSearch.more}>Показать ещё сотрудников</PpeButton> : null}</div>
        </aside>

        <main className="ppe-v2-card-pane">
          {workspaceLoading && !workspace ? <div className="ppe-v2-state ppe-v2-state-large">Загрузка карточки сотрудника…</div> : error && !workspace ? <div className="ppe-v2-state ppe-v2-state-large"><AlertTriangle size={32} /><strong>Не удалось открыть СИЗ</strong><span>{error}</span><PpeButton icon={<RefreshCw size={16} />} onClick={retryLoad} variant="secondary">Повторить</PpeButton></div> : !workspace ? <div className="ppe-v2-state ppe-v2-state-large"><UserRound size={32} /><strong>Выберите сотрудника</strong><span>Справа откроются нормы, выдача и печать.</span></div> : (
            <>
              {error ? <div className="ppe-workspace-refresh-error" role="alert"><span>{error}</span><PpeButton disabled={workspaceLoading} onClick={retryLoad}>Обновить карточку</PpeButton></div> : null}
              {workspaceLoading ? <p role="status">Обновляем карточку. Показаны ранее полученные данные.</p> : null}
              <EmployeeHeader
                onCreateIssue={() => onNavigate("inventory-ppe-create")}
                onOpenNormSettings={() => {
                  savePpeNormSettingsIntent(workspace.employee.position);
                  onNavigate("inventory-settings");
                }}
                workspace={workspace}
              />
              {!card ? (
                <div className="ppe-v2-state ppe-v2-state-large"><FileText size={34} /><strong>У сотрудника нет карточки СИЗ</strong><span>Создайте карточку из действующих норм, предыдущей карточки или пустого шаблона.</span><PpeButton onClick={() => onNavigate("inventory-ppe-create")} variant="primary">Создать карточку</PpeButton></div>
              ) : (
                <>
                  <div aria-label="Рабочие разделы карточки СИЗ" className="ppe-v2-mode-tabs" role="tablist">
                    <button aria-selected={mode === "norms"} className={mode === "norms" ? "is-active" : ""} onClick={() => setMode("norms")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Нормы</strong><small>Что положено сотруднику</small></span><b>{workspace.normsTotal}</b></button>
                    <button aria-selected={mode === "issued"} className={mode === "issued" ? "is-active" : ""} onClick={() => setMode("issued")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Фактическая выдача</strong><small>Выдано, возвращено, списано</small></span><b>{card.lines.filter((line) => line.status !== "archived").length}</b></button>
                    <button aria-selected={mode === "print"} className={mode === "print" ? "is-active" : ""} onClick={() => setMode("print")} role="tab" type="button"><span className="ppe-v2-mode-tab-copy"><strong>Печать</strong><small>Карточка и лист выдачи</small></span></button>
                  </div>
                  {mode === "norms" ? <NormContext workspace={workspace} onOpenNormSettings={() => { savePpeNormSettingsIntent(workspace.employee.position); onNavigate("inventory-settings"); }} /> : null}
                  {mode === "norms" ? <NormRowsTable rows={normRows} onIssue={() => onNavigate("inventory-ppe-create")} onMap={() => onNavigate("inventory-settings")} /> : null}
                  {mode === "issued" ? <IssuedTable canManage={canManage} actionsDisabled={workspaceLoading || refreshRequired} card={card} onAction={(line, action) => setLineAction({ action, line, cardId: card.id, version: card.version })} /> : null}
                  {mode === "print" && canExport && cardPrintData && sheetPrintData ? <PrintWorkspace cardData={cardPrintData} sheetData={sheetPrintData} downloadAction={downloadAction} onDownload={downloadPrint} onPreview={setPreviewMode} /> : null}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {previewMode && cardPrintData && sheetPrintData ? <LegacyPrintPreview key={selectedEmployeeId + ":" + card?.id} sources={{ card: cardPrintData, sheet: sheetPrintData }} mode={previewMode} onClose={() => setPreviewMode(null)} onModeChange={setPreviewMode} onPrint={printDocument} /> : null}
      {lineAction && card ? <PpeLineActionModal action={lineAction.action} line={lineAction.line} onClose={() => setLineAction(null)} onSubmit={applyLineAction} /> : null}
    </section>
  );
}

function EmployeeHeader({ onCreateIssue, onOpenNormSettings, workspace }: { onCreateIssue: () => void; onOpenNormSettings: () => void; workspace: InventoryPpeWorkspaceDto }) {
  const { employee, card } = workspace;
  return (
    <section className="ppe-v2-employee-head">
      <div className="ppe-v2-employee-main">
        <div className="ppe-v2-employee-identity"><span className="ppe-v2-avatar is-large">{initials(employee.fullName)}</span><div><h2>{employee.fullName}</h2><p>{employee.position} · {employee.department}</p></div></div>
        <PpeButton icon={<FileText size={16} />} onClick={onCreateIssue} size="touch" variant="primary">Оформить выдачу</PpeButton>
      </div>
      <dl className="ppe-v2-employee-meta"><div><dt>Табельный номер</dt><dd>{employee.personnelNo || "Не указан"}</dd></div><div><dt>Дата карточки</dt><dd>{card ? formatDate(card.createdAt) : "Нет карточки"}</dd></div></dl>
      <PhoneDisclosure title={`Сводка СИЗ · выдано ${workspace.issued}`}>
      <div className="ppe-v2-kpis">
        <Kpi label="Нормы" value={workspace.normsTotal} />
        <Kpi label="Выдано" tone="good" value={workspace.issued} />
        <Kpi label="Не выдано" tone="muted" value={workspace.notIssued} />
        <Kpi label="Частично" tone="warn" value={workspace.partial} />
        <Kpi label="Просрочено" tone="danger" value={workspace.overdue} />
        <Kpi label="Ошибки" tone="danger" value={workspace.errors} />
      </div>
      </PhoneDisclosure>
    </section>
  );
}
function NormContext({ workspace, onOpenNormSettings }: { workspace: InventoryPpeWorkspaceDto; onOpenNormSettings: () => void }) {
  const employee = workspace.employee;
  return (
      <div className={"ppe-v2-norm-context " + (workspace.activeNormSet ? "is-ready" : "is-missing")}>
        <ShieldCheck size={18} />
        <div><strong>{workspace.activeNormSet ? "Применяются нормы должности" : "Опубликованные нормы не найдены"}</strong><span>{workspace.activeNormSet ? workspace.activeNormSet.positionName + " · версия " + workspace.activeNormSet.versionName + " · " + workspace.activeNormSet.sourceName : "Должность: " + employee.position + ". Карточку можно вести вручную, но нормативный источник не подтверждён."}</span></div>
        {!workspace.activeNormSet ? <PpeButton onClick={onOpenNormSettings} size="compact" variant="secondary">Найти и проверить норму</PpeButton> : null}
      </div>
  );
}
function Kpi({ label, tone = "", value }: { label: string; tone?: string; value: number }) {
  const visibleTone = (tone === "danger" || tone === "warn") && value === 0 ? "muted" : tone;
  return <span className={visibleTone ? `is-${visibleTone}` : ""}><small>{label}</small><strong>{value}</strong></span>;
}

type NormRowsFilter = "all" | "mapping" | "issue" | "attention";

function NormRowsTable({ rows, onIssue, onMap }: { rows: InventoryPpeCardNormRowDto[]; onIssue: (row: InventoryPpeCardNormRowDto) => void; onMap: (row: InventoryPpeCardNormRowDto) => void }) {
  const [filter, setFilter] = useState<NormRowsFilter>("all");
  const itemRows = rows.filter((row) => row.rowType !== "group");
  const needMapping = itemRows.filter((row) => !row.mappedItemId).length;
  const needIssue = itemRows.filter((row) => row.coverageStatus === "not_issued" || row.coverageStatus === "partial").length;
  const attention = itemRows.filter((row) => row.coverageStatus === "overdue" || row.coverageStatus === "partial").length;
  const visibleRows = filter === "all"
    ? rows
    : rows.filter((row) => row.rowType !== "group" && (
      filter === "mapping" ? !row.mappedItemId
        : filter === "issue" ? row.coverageStatus === "not_issued" || row.coverageStatus === "partial"
          : row.coverageStatus === "overdue" || row.coverageStatus === "partial"
    ));
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>В карточке нет строк норм</strong><span>Добавьте нормы вручную или создайте карточку из опубликованного набора должности.</span></div>;
  return (
    <section className="ppe-v2-work-section">
      <header className="ppe-v2-work-section-head"><div><h3>Нормы обеспечения</h3><p>Сопоставлено с номенклатурой: {itemRows.length - needMapping} из {itemRows.length}</p></div></header>
      <div aria-label="Быстрый фильтр норм" className="ppe-v2-norm-filters" role="tablist">
        <button aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} role="tab" type="button"><span>Все нормы</span><b>{itemRows.length}</b></button>
        <button aria-selected={filter === "mapping"} className={filter === "mapping" ? "is-active" : ""} onClick={() => setFilter("mapping")} role="tab" type="button"><span>Нужно сопоставить</span><b>{needMapping}</b></button>
        <button aria-selected={filter === "issue"} className={filter === "issue" ? "is-active" : ""} onClick={() => setFilter("issue")} role="tab" type="button"><span>Нужно выдать</span><b>{needIssue}</b></button>
        <button aria-selected={filter === "attention"} className={filter === "attention" ? "is-active" : ""} onClick={() => setFilter("attention")} role="tab" type="button"><span>Требуют внимания</span><b>{attention}</b></button>
      </div>
      <div className="ppe-v2-table-wrap">
        {visibleRows.length ? <table className="ppe-v2-table ppe-v2-norm-table ppe-v2-responsive-table"><thead><tr><th>Наименование СИЗ</th><th>Пункт норм</th><th>Периодичность</th><th>Количество</th><th>Номенклатура</th><th>Покрытие</th><th aria-label="Действия" /></tr></thead>
          <tbody>{visibleRows.map((row) => row.rowType === "group" ? <tr className="ppe-v2-group-row" key={row.id}><th colSpan={7}>{row.normItemName}</th></tr> : (
            <tr className={`is-${row.coverageStatus} ${row.mappedItemId ? "is-mapped" : "is-unmapped"}`} key={row.id}><td data-label="СИЗ"><strong>{row.normItemName}</strong></td><td data-label="Пункт норм">{row.normPoint || "—"}</td><td data-label="Периодичность">{row.issuePeriodText || "—"}</td><td data-label="Количество">{row.quantityText || row.quantity}</td><td data-label="Номенклатура"><button className={`ppe-v2-link-button ${row.mappedItemId ? "is-selected" : "is-required"}`} onClick={() => onMap(row)} type="button">{row.mappedItemName || "Выбрать номенклатуру"}</button>{row.mappings.length > 1 ? <small>Допустимых вариантов: {row.mappings.length}</small> : row.brandModelArticle ? <small>{row.brandModelArticle}</small> : <small>{row.mappedItemId ? "Номенклатура связана" : "Связь с товаром ещё не задана"}</small>}</td><td data-label="Покрытие"><Coverage status={row.coverageStatus} /></td><td className="ppe-v2-actions-cell"><PpeButton className="ppe-v2-row-action" onClick={() => onIssue(row)} size="compact" variant="secondary">{row.mappedItemId ? "Выдать" : "Подобрать и выдать"}</PpeButton></td></tr>
          ))}</tbody>
        </table> : <div className="ppe-v2-state ppe-v2-filter-empty"><strong>По этому фильтру норм нет</strong><span>Вернитесь к общему списку или выберите другой этап работы.</span><PpeButton onClick={() => setFilter("all")} size="compact" variant="secondary">Показать все нормы</PpeButton></div>}
      </div>
    </section>
  );
}
function Coverage({ status }: { status: InventoryPpeCardNormRowDto["coverageStatus"] }) {
  const labels = { issued: "Выдано", not_issued: "Не выдано", overdue: "Просрочено", partial: "Частично" };
  return <span className={`ppe-v2-status is-${status}`}>{status === "issued" ? <CheckCircle2 size={14} /> : null}{labels[status]}</span>;
}

function IssuedTable({ card, onAction, canManage, actionsDisabled }: { canManage: boolean; actionsDisabled: boolean; card: InventoryPpeCardDetailDto; onAction: (line: InventoryPpeCardLineDto, action: ApplyInventoryPpeLineActionDto["action"]) => void }) {
  const rows = [...card.lines].filter((line) => line.status !== "archived").sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));
  const active = rows.filter((line) => line.status === "issued" || line.status === "defective").length;
  const returned = rows.filter((line) => line.status === "returned").length;
  const writtenOff = rows.filter((line) => line.status === "written_off").length;
  if (!rows.length) return <div className="ppe-v2-state ppe-v2-state-large"><ShieldCheck size={34} /><strong>Фактов выдачи пока нет</strong><span>Нормы остаются в личной карточке, лист выдачи пуст.</span></div>;
  return (
    <section className="ppe-v2-work-section">
      <header className="ppe-v2-work-section-head"><div><span className="ppe-v2-eyebrow">Фактическая выдача</span><h3>Что сотрудник получил</h3><p>Операции отсортированы от новой даты к старой. Завершённые строки нельзя провести повторно.</p></div><div className="ppe-v2-section-counters"><span><strong>{rows.length}</strong><small>всего</small></span><span className="is-ready"><strong>{active}</strong><small>на руках</small></span><span><strong>{returned}</strong><small>возвращено</small></span><span><strong>{writtenOff}</strong><small>списано</small></span></div></header>
      <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-responsive-table"><thead><tr><th>СИЗ</th><th>Модель / артикул</th><th>Дата выдачи</th><th>Количество</th><th>Способ</th><th>Статус</th><th aria-label="Действия" /></tr></thead><tbody>{rows.map((line) => {
        const actions = canManage ? availableLineActions(line.status) : [];
        return <tr className={`is-${line.status}`} key={line.id}><td data-label="СИЗ"><strong>{line.printItemName || line.itemName}</strong>{line.printItemName && line.printItemName !== line.itemName ? <small>{line.itemName}</small> : null}</td><td data-label="Модель / артикул">{line.brandModelArticle || "Не указано"}</td><td data-label="Дата выдачи">{formatDate(line.issuedAt)}</td><td data-label="Количество">{line.quantity} {line.unit}</td><td data-label="Способ">{line.issueMethod === "dispenser" ? "Дозатор" : "Лично"}</td><td data-label="Статус"><span className={`ppe-v2-status is-${line.status}`}>{issueStatusLabel(line.status)}</span></td><td className="ppe-v2-actions-cell">{actions.length ? <details className="ppe-v2-row-menu"><summary aria-label={`Действия: ${line.printItemName || line.itemName}`}><MoreVertical size={18} /></summary><div>{actions.map((action) => <button disabled={actionsDisabled} className={action === "written_off" || action === "defective" ? "is-danger" : ""} key={action} onClick={() => onAction(line, action)} type="button">{lineActionLabel(action)}</button>)}</div></details> : <span className="ppe-v2-row-closed">Операция завершена</span>}</td></tr>;
      })}</tbody></table></div>
    </section>
  );
}

function availableLineActions(status: string): ApplyInventoryPpeLineActionDto["action"][] {
  if (["issued", "partial", "replacement", "reissued"].includes(status)) return ["returned", "written_off", "defective"];
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
function employeeStorageKey(owner: string) { return owner && owner !== "anonymous" ? "patrol360.inventory.ppe.employee." + owner : null; }
function readSelectedEmployee(owner: string) { const key = employeeStorageKey(owner); return typeof window === "undefined" || !key ? "" : readDocumentStorage("localStorage", key) ?? ""; }
function issueStatusLabel(status: string) { return ({ defective: "Неисправно", issued: "Выдано", returned: "Возвращено", written_off: "Списано" } as Record<string, string>)[status] ?? status; }
function navigateByHash(screen: ScreenId) { window.location.hash = screen; }
