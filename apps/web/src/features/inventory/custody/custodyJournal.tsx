import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, CalendarDays, FileText, History, RotateCcw, Search, Trash2, UserRound, Wrench, X } from "lucide-react";
import type {
  InventoryCustodyDocumentDto,
  InventoryCustodyRecordDto,
  InventoryEmployeeDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { CustodyPrintPreview } from "./custodyPrint";
import {
  CUSTODY_ITEM_GROUPS,
  CustodyState,
  CustodyStatus,
  Meta,
  custodyMovementActionLabels,
  documentStatusLabel,
  formatDate,
  formatQuantity,
  getCustodyRecordGroup,
  getDocumentIdByRecordId,
  getInitials,
  isActiveCustodyRecord,
  recordStatusLabel,
  type CustodyMovementAction,
} from "./custodyCommon";

type CustodyMovement = {
  action: CustodyMovementAction;
  actor: string;
  comment: string;
  date: string;
  employeeName: string;
  group: string;
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  unit: string;
};

type MovementFilters = {
  action: "all" | CustodyMovementAction;
  dateFrom: string;
  dateTo: string;
  employee: string;
  group: "all" | string;
  item: string;
  status: "all" | string;
};

const emptyMovementFilters: MovementFilters = {
  action: "all",
  dateFrom: "",
  dateTo: "",
  employee: "all",
  group: "all",
  item: "",
  status: "all",
};

export function CustodyJournal({
  busyAction,
  documents,
  onDownload,
  onOpenDocument,
  onSelectDocument,
  query,
  selectedDocument,
  setQuery,
}: {
  busyAction: string;
  documents: InventoryCustodyDocumentDto[];
  onDownload: (action: () => Promise<{ blob: Blob; fileName: string }>) => Promise<void>;
  onOpenDocument: (documentId: string) => Promise<void>;
  onSelectDocument: (documentId: string) => void;
  query: string;
  selectedDocument: InventoryCustodyDocumentDto | null;
  setQuery: (query: string) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  const visibleDocuments = filterDocuments(documents, query);
  return (
    <section className="inventory-custody-journal">
      <div className="inventory-custody-panel-head">
        <div>
          <h2>Журнал актов</h2>
          <p>{visibleDocuments.length} из {documents.length} актов</p>
        </div>
        <label className="inventory-custody-search">
          <Search size={17} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по акту, сотруднику, предмету или статусу"
            type="search"
            value={query}
          />
        </label>
      </div>

      {!visibleDocuments.length ? (
        <CustodyState kind="empty" text="Измените поисковый запрос или очистите фильтр." title="По текущему фильтру актов нет" />
      ) : (
        <div className="inventory-custody-act-list" role="list">
          {visibleDocuments.map((row) => (
            <article
              className={`inventory-custody-act-row${selectedDocument?.id === row.id ? " is-selected" : ""}`}
              key={row.id}
              onClick={() => onSelectDocument(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDocument(row.id);
                }
              }}
              role="listitem"
              tabIndex={0}
            >
              <div className="inventory-custody-act-main">
                <strong>{row.number}</strong>
                <span>{formatDate(row.createdAt)}</span>
              </div>
              <div className="inventory-custody-act-person">
                <span>Сотрудник</span>
                <strong>{row.employeeName}</strong>
              </div>
              <div className="inventory-custody-act-status">
                <CustodyStatus scope="document" status={row.status} />
                <span>{row.recordsCount} строк</span>
              </div>
              <div className="inventory-custody-row-actions">
                <button className="button ghost" disabled={busyAction === `open-${row.id}`} onClick={(event) => { event.stopPropagation(); void onOpenDocument(row.id); }} type="button">
                  Открыть
                </button>
                <button className="button ghost" onClick={(event) => { event.stopPropagation(); void onDownload(() => inventoryRepository.printCustodyDocument(row.id, "pdf")); }} type="button">
                  PDF
                </button>
                <button className="button ghost" onClick={(event) => { event.stopPropagation(); void onDownload(() => inventoryRepository.printCustodyDocument(row.id, "docx")); }} type="button">
                  DOCX
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function CustodyRecordsSection({
  busyAction,
  documents,
  employees,
  onArchiveRecord,
  onOpenRecordHistory,
  onSelectEmployee,
  onUpdateRecordStatus,
  records,
  selectedEmployeeId,
}: {
  busyAction: string;
  documents: InventoryCustodyDocumentDto[];
  employees: InventoryEmployeeDto[];
  onArchiveRecord: (row: InventoryCustodyRecordDto, documentId?: string) => Promise<void>;
  onOpenRecordHistory: (row: InventoryCustodyRecordDto) => Promise<void>;
  onSelectEmployee: (employeeId: string) => void;
  onUpdateRecordStatus: (row: InventoryCustodyRecordDto, status: string, documentId?: string, comment?: string) => Promise<void>;
  records: InventoryCustodyRecordDto[];
  selectedEmployeeId: string;
}) {
  const [recordQuery, setRecordQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_use" | "returned" | "written_off" | "lost" | "archived">("all");
  const [groupFilter, setGroupFilter] = useState<"all" | string>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [movementFilters, setMovementFilters] = useState<MovementFilters>(emptyMovementFilters);
  const documentIdByRecordId = useMemo(() => getDocumentIdByRecordId(documents, records), [documents, records]);
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const employeeRecords = selectedEmployee
    ? records.filter((row) => samePerson(row.employeeName, selectedEmployee.fullName))
    : [];
  const onHandsRecords = employeeRecords.filter(isActiveCustodyRecord);

  const baseFilteredRecords = useMemo(() => {
    const rows = filterRecords(records, recordQuery);
    if (groupFilter === "all") return rows;
    return rows.filter((row) => getCustodyRecordGroup(row) === groupFilter);
  }, [groupFilter, recordQuery, records]);

  const visibleRecords = useMemo(() => {
    if (activeOnly) return baseFilteredRecords.filter(isActiveCustodyRecord);
    if (statusFilter === "all") return baseFilteredRecords;
    if (statusFilter === "in_use") return baseFilteredRecords.filter(isActiveCustodyRecord);
    return baseFilteredRecords.filter((row) => row.status === statusFilter);
  }, [activeOnly, baseFilteredRecords, statusFilter]);

  const counters = useMemo(() => {
    return {
      all: baseFilteredRecords.length,
      archived: baseFilteredRecords.filter((row) => row.status === "archived").length,
      in_use: baseFilteredRecords.filter(isActiveCustodyRecord).length,
      lost: baseFilteredRecords.filter((row) => row.status === "lost").length,
      returned: baseFilteredRecords.filter((row) => row.status === "returned").length,
      written_off: baseFilteredRecords.filter((row) => row.status === "written_off").length,
    };
  }, [baseFilteredRecords]);

  const movements = useMemo(() => buildMovements(records), [records]);
  const filteredMovements = useMemo(() => filterMovements(movements, movementFilters), [movementFilters, movements]);
  const movementTotals = useMemo(() => buildMovementTotals(records), [records]);

  return (
    <section className="inventory-custody-card-section">
      <div className="inventory-custody-section-head">
        <div>
          <h3>Движение предметов</h3>
          <span>Сначала выберите сотрудника, затем выполните возврат, списание или отметьте неисправность.</span>
        </div>
      </div>

      <div className="inventory-custody-employee-flow">
        <label className="inventory-custody-employee-select">
          <UserRound size={17} />
          <span>Сотрудник</span>
          <select value={selectedEmployeeId} onChange={(event) => onSelectEmployee(event.target.value)}>
            <option value="">Выберите сотрудника</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {[employee.fullName, employee.personnelNo].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>

        <div className="inventory-custody-onhands-panel">
          <div className="inventory-custody-onhands-head">
            <div>
              <strong>{selectedEmployee?.fullName ?? "Сотрудник не выбран"}</strong>
              <span>{selectedEmployee ? `${onHandsRecords.length} предметов на руках` : "Выберите сотрудника, чтобы увидеть его предметы"}</span>
            </div>
            <div className="inventory-custody-onhands-stats">
              <Meta label="Выдано всего" value={String(employeeRecords.length)} />
              <Meta label="На руках" value={String(onHandsRecords.length)} />
              <Meta label="Возвращено" value={String(employeeRecords.filter((row) => row.status === "returned").length)} />
            </div>
          </div>

          {!selectedEmployee ? (
            <CustodyState kind="empty" text="Возврат и списание доступны только после выбора сотрудника." title="Выберите сотрудника" />
          ) : !onHandsRecords.length ? (
            <CustodyState kind="empty" text="У сотрудника нет предметов в статусе «На руках»." title="Предметов на руках нет" />
          ) : (
            <CustodyRecordTable
              busyAction={busyAction}
              documentIdByRecordId={documentIdByRecordId}
              onArchiveRecord={onArchiveRecord}
              onOpenRecordHistory={onOpenRecordHistory}
              onUpdateRecordStatus={onUpdateRecordStatus}
              rows={onHandsRecords}
            />
          )}
        </div>
      </div>

      <div className="inventory-custody-record-toolbar" aria-label="Фильтры строк под запись">
        <label className="inventory-custody-record-search">
          <Search size={15} />
          <input
            onChange={(event) => setRecordQuery(event.target.value)}
            placeholder="Сотрудник, предмет, комментарий"
            type="search"
            value={recordQuery}
          />
        </label>
        <select aria-label="Группа предметов" onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}>
          <option value="all">Все группы</option>
          {CUSTODY_ITEM_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <label className="inventory-custody-record-toggle">
          <input checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} type="checkbox" />
          <span>Только на руках</span>
        </label>
      </div>

      <div className="inventory-custody-record-filters" aria-label="Фильтр статуса строк под запись">
        <button className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")} type="button">Все <span>{counters.all}</span></button>
        <button className={statusFilter === "in_use" ? "is-active" : ""} onClick={() => setStatusFilter("in_use")} type="button">На руках <span>{counters.in_use}</span></button>
        <button className={statusFilter === "returned" ? "is-active" : ""} onClick={() => setStatusFilter("returned")} type="button">Возвращено <span>{counters.returned}</span></button>
        <button className={statusFilter === "written_off" ? "is-active" : ""} onClick={() => setStatusFilter("written_off")} type="button">Списано <span>{counters.written_off}</span></button>
        <button className={statusFilter === "lost" ? "is-active" : ""} onClick={() => setStatusFilter("lost")} type="button"><AlertTriangle size={14} /> Неисправно <span>{counters.lost}</span></button>
        <button className={statusFilter === "archived" ? "is-active" : ""} onClick={() => setStatusFilter("archived")} type="button">Архив <span>{counters.archived}</span></button>
      </div>

      {!visibleRecords.length ? (
        <CustodyState kind="empty" text={records.length ? "Измените поиск, группу или статус, чтобы увидеть строки." : "Записи появятся после выдачи под запись или импорта актов."} title={records.length ? "По текущим фильтрам строк нет" : "Строк под запись пока нет"} />
      ) : (
        <div className="inventory-custody-lines-wrap">
          <CustodyRecordTable
            busyAction={busyAction}
            documentIdByRecordId={documentIdByRecordId}
            onArchiveRecord={onArchiveRecord}
            onOpenRecordHistory={onOpenRecordHistory}
            onUpdateRecordStatus={onUpdateRecordStatus}
            rows={visibleRecords}
          />
        </div>
      )}

      <section className="inventory-custody-movement-journal">
        <div className="inventory-custody-section-head">
          <div>
            <h3>Единый журнал движения</h3>
            <span>{"Цепочка движения: выдано -> возвращено / списано / неисправно."}</span>
          </div>
          <button className="button ghost" onClick={() => setMovementFilters(emptyMovementFilters)} type="button">Сбросить</button>
        </div>

        <div className="inventory-custody-movement-kpis">
          <Meta label="Всего выдано" value={formatQuantity(movementTotals.issued)} />
          <Meta label="На руках" value={formatQuantity(movementTotals.inUse)} />
          <Meta label="Возвращено" value={formatQuantity(movementTotals.returned)} />
          <Meta label="Списано" value={formatQuantity(movementTotals.writtenOff)} />
          <Meta label="Неисправно" value={formatQuantity(movementTotals.lost)} />
        </div>

        <div className="inventory-custody-movement-filters">
          <label>
            <Search size={15} />
            <input
              onChange={(event) => setMovementFilters((current) => ({ ...current, item: event.target.value }))}
              placeholder="Предмет, сотрудник, комментарий"
              type="search"
              value={movementFilters.item}
            />
          </label>
          <label>
            <CalendarDays size={15} />
            <input onChange={(event) => setMovementFilters((current) => ({ ...current, dateFrom: event.target.value }))} type="date" value={movementFilters.dateFrom} />
          </label>
          <label>
            <CalendarDays size={15} />
            <input onChange={(event) => setMovementFilters((current) => ({ ...current, dateTo: event.target.value }))} type="date" value={movementFilters.dateTo} />
          </label>
          <select onChange={(event) => setMovementFilters((current) => ({ ...current, employee: event.target.value }))} value={movementFilters.employee}>
            <option value="all">Все сотрудники</option>
            {employees.map((employee) => <option key={employee.id} value={employee.fullName}>{employee.fullName}</option>)}
          </select>
          <select onChange={(event) => setMovementFilters((current) => ({ ...current, action: event.target.value as MovementFilters["action"] }))} value={movementFilters.action}>
            <option value="all">Все действия</option>
            {Object.entries(custodyMovementActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select onChange={(event) => setMovementFilters((current) => ({ ...current, status: event.target.value }))} value={movementFilters.status}>
            <option value="all">Все статусы</option>
            <option value="in_use">На руках</option>
            <option value="returned">Возвращено</option>
            <option value="written_off">Списано</option>
            <option value="lost">Неисправно</option>
          </select>
          <select onChange={(event) => setMovementFilters((current) => ({ ...current, group: event.target.value }))} value={movementFilters.group}>
            <option value="all">Все группы</option>
            {CUSTODY_ITEM_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>

        <div className="inventory-custody-movement-table-wrap">
          <table className="inventory-custody-movement-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сотрудник</th>
                <th>Предмет</th>
                <th>Действие</th>
                <th>Кол-во</th>
                <th>Статус</th>
                <th>Группа</th>
                <th>Кто сделал</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.employeeName || "Не указан"}</td>
                  <td>{row.itemName}</td>
                  <td>{custodyMovementActionLabels[row.action]}</td>
                  <td>{formatQuantity(row.quantity)} {row.unit}</td>
                  <td><CustodyStatus scope="record" status={row.status} /></td>
                  <td>{row.group}</td>
                  <td>{row.actor}</td>
                  <td>{row.comment || "Без комментария"}</td>
                </tr>
              ))}
              {!filteredMovements.length ? (
                <tr>
                  <td colSpan={9}>По текущим фильтрам движений нет.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export function CustodyInspector({
  document,
  onDownload,
  onOpenDocument,
}: {
  document: InventoryCustodyDocumentDto | null;
  onDownload: (action: () => Promise<{ blob: Blob; fileName: string }>) => Promise<void>;
  onOpenDocument: (documentId: string) => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  if (!document) {
    return (
      <aside className="inventory-custody-inspector">
        <CustodyState kind="empty" text="Выберите акт в журнале, чтобы открыть детали, печать и историю." title="Акт не выбран" />
      </aside>
    );
  }

  return (
    <aside className="inventory-custody-inspector">
      <div className="inventory-custody-profile">
        <span>{getInitials(document.employeeName)}</span>
        <div>
          <strong>{document.number}</strong>
          <small>{document.employeeName}</small>
        </div>
      </div>

      <div className="inventory-custody-meta-grid">
        <Meta label="Дата" value={formatDate(document.createdAt)} />
        <Meta label="Статус" value={documentStatusLabel(document.status)} />
        <Meta label="Строк" value={String(document.recordsCount)} />
      </div>

      <div className="inventory-custody-inspector-actions">
        <button className="button primary" onClick={() => void onOpenDocument(document.id)} type="button">
          <FileText size={16} />
          Открыть акт
        </button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printCustodyDocument(document.id, "pdf"))} type="button">
          PDF
        </button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printCustodyDocument(document.id, "docx"))} type="button">
          DOCX
        </button>
      </div>

      <CustodyPrintPreview document={document} />
    </aside>
  );
}

export function CustodyRecordTable({
  busyAction,
  documentIdByRecordId,
  onArchiveRecord,
  onOpenRecordHistory,
  onUpdateRecordStatus,
  rows,
}: {
  busyAction: string;
  documentIdByRecordId: Map<string, string>;
  onArchiveRecord: (row: InventoryCustodyRecordDto, documentId?: string) => Promise<void>;
  onOpenRecordHistory: (row: InventoryCustodyRecordDto) => Promise<void>;
  onUpdateRecordStatus: (row: InventoryCustodyRecordDto, status: string, documentId?: string, comment?: string) => Promise<void>;
  rows: InventoryCustodyRecordDto[];
}) {
  const [pendingAction, setPendingAction] = useState<CustodyRecordAction | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  function openAction(action: CustodyRecordAction) {
    setPendingAction(action);
    setActionComment("");
    setActionError("");
  }

  async function submitAction() {
    if (!pendingAction) return;
    if (pendingAction.commentRequired && actionComment.trim().length === 0) {
      setActionError("Укажите причину или комментарий");
      return;
    }

    await onUpdateRecordStatus(pendingAction.row, pendingAction.status, pendingAction.documentId, actionComment);
    setPendingAction(null);
    setActionComment("");
    setActionError("");
  }

  return (
    <div className="inventory-custody-record-list">
      {rows.map((row) => {
        const documentId = documentIdByRecordId.get(row.id);
        const rowIsActive = isActiveCustodyRecord(row);
        const canWriteOff = rowIsActive || row.status === "returned" || row.status === "lost";
        return (
          <article className="inventory-custody-record-row" key={row.id}>
            <div className="inventory-custody-record-main">
              <strong>{row.itemName}</strong>
              <span>{row.comment || "Без комментария"}</span>
            </div>
            <div className="inventory-custody-record-meta">
              <span>Сотрудник</span>
              <strong>{row.employeeName || "Не указан"}</strong>
            </div>
            <div className="inventory-custody-record-meta">
              <span>Группа</span>
              <strong>{getCustodyRecordGroup(row)}</strong>
            </div>
            <div className="inventory-custody-record-meta">
              <span>Количество</span>
              <strong>{formatQuantity(row.quantity)} {row.unit || ""}</strong>
            </div>
            <div className="inventory-custody-record-meta">
              <span>Выдано</span>
              <strong>{formatDate(row.issuedAt)}</strong>
            </div>
            <div className="inventory-custody-record-status">
              <CustodyStatus scope="record" status={row.status} />
            </div>
            <div className="inventory-custody-line-actions">
              <button className="button ghost" disabled={busyAction === `history-${row.id}`} onClick={() => void onOpenRecordHistory(row)} type="button">
                <History size={15} />
                История
              </button>
              <button className="button ghost" disabled={!rowIsActive || busyAction === `returned-${row.id}`} onClick={() => openAction({
                commentLabel: "Комментарий к возврату",
                confirmLabel: "Провести возврат",
                documentId,
                row,
                status: "returned",
                title: "Вернуть предмет",
              })} type="button">
                <RotateCcw size={15} />
                Вернуть
              </button>
              <button className="button ghost" disabled={!rowIsActive || busyAction === `lost-${row.id}`} onClick={() => openAction({
                commentLabel: "Что неисправно или требует проверки",
                commentRequired: true,
                confirmLabel: "Зафиксировать неисправность",
                documentId,
                row,
                status: "lost",
                title: "Неисправность / поломка",
              })} type="button">
                <Wrench size={15} />
                Поломка
              </button>
              <button className="button ghost danger" disabled={!canWriteOff || busyAction === `written_off-${row.id}`} onClick={() => openAction({
                commentLabel: "Причина списания, номер акта или документа",
                commentRequired: true,
                confirmLabel: "Провести списание",
                documentId,
                row,
                status: "written_off",
                title: "Списать предмет",
              })} type="button">
                <Trash2 size={15} />
                Списать
              </button>
              <button className="button ghost danger" disabled={busyAction === `archive-${row.id}`} onClick={() => void onArchiveRecord(row, documentId)} type="button">
                <Archive size={15} />
                Архив
              </button>
            </div>
          </article>
        );
      })}
      {pendingAction
        ? createPortal(
          <div className="inventory-custody-action-backdrop" role="presentation" onMouseDown={() => setPendingAction(null)}>
            <div className="inventory-custody-action-modal" role="dialog" aria-modal="true" aria-label={pendingAction.title} onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <span>Операция под запись</span>
                  <h3>{pendingAction.title}</h3>
                </div>
                <button className="inventory-custody-icon-button" onClick={() => setPendingAction(null)} type="button" aria-label="Закрыть">
                  <X size={18} />
                </button>
              </header>
              <div className="inventory-custody-action-summary">
                <div>
                  <span>Сотрудник</span>
                  <strong>{pendingAction.row.employeeName || "Не указан"}</strong>
                </div>
                <div>
                  <span>Предмет</span>
                  <strong>{pendingAction.row.itemName}</strong>
                </div>
                <div>
                  <span>Количество</span>
                  <strong>{formatQuantity(pendingAction.row.quantity)} {pendingAction.row.unit || ""}</strong>
                </div>
                <div>
                  <span>Текущий статус</span>
                  <strong>{recordStatusLabel(pendingAction.row.status)}</strong>
                </div>
              </div>
              <label className="inventory-custody-action-comment">
                {pendingAction.commentLabel}
                <textarea
                  autoFocus
                  onChange={(event) => {
                    setActionComment(event.target.value);
                    if (actionError) setActionError("");
                  }}
                  placeholder="Комментарий попадет в историю движения"
                  value={actionComment}
                />
              </label>
              {actionError ? <p className="inventory-custody-action-error">{actionError}</p> : null}
              <footer>
                <button className="button ghost" onClick={() => setPendingAction(null)} type="button">Отмена</button>
                <button className="button primary" disabled={busyAction === `${pendingAction.status}-${pendingAction.row.id}`} onClick={() => void submitAction()} type="button">
                  {pendingAction.confirmLabel}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

type CustodyRecordAction = {
  commentLabel: string;
  commentRequired?: boolean;
  confirmLabel: string;
  documentId?: string;
  row: InventoryCustodyRecordDto;
  status: "returned" | "written_off" | "lost";
  title: string;
};

function buildMovements(records: InventoryCustodyRecordDto[]): CustodyMovement[] {
  return records.flatMap((row) => {
    const group = getCustodyRecordGroup(row);
    const issued: CustodyMovement = {
      action: "issued",
      actor: "system",
      comment: row.comment,
      date: row.issuedAt,
      employeeName: row.employeeName,
      group,
      id: `${row.id}-issued`,
      itemName: row.itemName,
      quantity: row.quantity,
      status: "in_use",
      unit: row.unit,
    };

    if (!["returned", "written_off", "lost"].includes(row.status)) {
      return [issued];
    }

    return [
      issued,
      {
        action: row.status as CustodyMovementAction,
        actor: "system",
        comment: row.comment,
        date: row.closedAt || row.issuedAt,
        employeeName: row.employeeName,
        group,
        id: `${row.id}-${row.status}`,
        itemName: row.itemName,
        quantity: row.quantity,
        status: row.status,
        unit: row.unit,
      },
    ];
  });
}

function buildMovementTotals(records: InventoryCustodyRecordDto[]) {
  return records.reduce((acc, row) => {
    acc.issued += row.quantity;
    if (isActiveCustodyRecord(row)) acc.inUse += row.quantity;
    if (row.status === "returned") acc.returned += row.quantity;
    if (row.status === "written_off") acc.writtenOff += row.quantity;
    if (row.status === "lost") acc.lost += row.quantity;
    return acc;
  }, { inUse: 0, issued: 0, lost: 0, returned: 0, writtenOff: 0 });
}

function filterMovements(rows: CustodyMovement[], filters: MovementFilters) {
  const query = filters.item.trim().toLowerCase();
  const dateFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

  return rows.filter((row) => {
    const rowDate = new Date(row.date);
    if (dateFrom && rowDate < dateFrom) return false;
    if (dateTo && rowDate > dateTo) return false;
    if (filters.employee !== "all" && !samePerson(row.employeeName, filters.employee)) return false;
    if (filters.action !== "all" && row.action !== filters.action) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.group !== "all" && row.group !== filters.group) return false;
    if (!query) return true;
    return [row.employeeName, row.itemName, row.comment, row.group, row.status]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function filterDocuments(documents: InventoryCustodyDocumentDto[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return documents;
  return documents.filter((row) =>
    [row.number, row.employeeName, documentStatusLabel(row.status), row.status].join(" ").toLowerCase().includes(normalized),
  );
}

function filterRecords(records: InventoryCustodyRecordDto[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((row) =>
    [row.employeeName, row.itemName, row.comment, recordStatusLabel(row.status), getCustodyRecordGroup(row), row.status].join(" ").toLowerCase().includes(normalized),
  );
}

function samePerson(left?: string | null, right?: string | null) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}
