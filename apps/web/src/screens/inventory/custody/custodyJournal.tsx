import { Archive, FileText, History, RotateCcw, Search, Trash2 } from "lucide-react";
import type {
  InventoryCustodyDocumentDto,
  InventoryCustodyRecordDto,
  InventoryListResponseDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { CustodyPrintPreview } from "./custodyPrint";
import {
  CustodyState,
  CustodyStatus,
  Meta,
  documentStatusLabel,
  formatDate,
  formatQuantity,
  getCustodyCounts,
  getDocumentIdByRecordId,
  getInitials,
  recordStatusLabel,
} from "./custodyCommon";

export function CustodyKpis({ documents, records }: { documents: InventoryCustodyDocumentDto[]; records: InventoryCustodyRecordDto[] }) {
  const counts = getCustodyCounts(documents, records);
  return (
    <section className="inventory-custody-kpis" aria-label="Сводка под запись">
      <CustodyKpi label="Актов" value={counts.documents} />
      <CustodyKpi label="Открыто" tone="green" value={counts.open} />
      <CustodyKpi label="Закрыто" tone="blue" value={counts.closed} />
      <CustodyKpi label="Строк учета" tone="slate" value={counts.records} />
      <CustodyKpi label="На руках" tone="red" value={counts.inUse} />
    </section>
  );
}

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
            placeholder="Поиск по акту, сотруднику или статусу"
            type="search"
            value={query}
          />
        </label>
      </div>

      {!visibleDocuments.length ? (
        <CustodyState kind="empty" text="Измените поисковый запрос или очистите фильтр." title="По текущему фильтру актов нет" />
      ) : (
        <div className="inventory-custody-table-wrap">
          <table className="inventory-custody-table">
            <thead>
              <tr>
                <th>Акт</th>
                <th>Дата</th>
                <th>Сотрудник</th>
                <th>Статус</th>
                <th>Строк</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map((row) => (
                <tr className={selectedDocument?.id === row.id ? "is-selected" : ""} key={row.id} onClick={() => onSelectDocument(row.id)}>
                  <td><strong>{row.number}</strong></td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td><strong>{row.employeeName}</strong></td>
                  <td><CustodyStatus scope="document" status={row.status} /></td>
                  <td>{row.recordsCount}</td>
                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function CustodyRecordsSection({
  busyAction,
  documents,
  onArchiveRecord,
  onOpenRecordHistory,
  onUpdateRecordStatus,
  query,
  records,
}: {
  busyAction: string;
  documents: InventoryCustodyDocumentDto[];
  onArchiveRecord: (row: InventoryCustodyRecordDto, documentId?: string) => Promise<void>;
  onOpenRecordHistory: (row: InventoryCustodyRecordDto) => Promise<void>;
  onUpdateRecordStatus: (row: InventoryCustodyRecordDto, status: string, documentId?: string) => Promise<void>;
  query: string;
  records: InventoryCustodyRecordDto[];
}) {
  const visibleRecords = filterRecords(records, query);
  return (
    <section className="inventory-custody-card-section">
      <div className="inventory-custody-section-head">
        <h3>Строки материальной ответственности</h3>
        <span>{visibleRecords.length} из {records.length} строк</span>
      </div>
      {!visibleRecords.length ? (
        <CustodyState kind="empty" text="Записи появятся после выдачи под запись или импорта актов." title="Строк по текущему фильтру нет" />
      ) : (
        <div className="inventory-custody-lines-wrap">
          <CustodyRecordTable
            busyAction={busyAction}
            documentIdByRecordId={getDocumentIdByRecordId(documents, records)}
            onArchiveRecord={onArchiveRecord}
            onOpenRecordHistory={onOpenRecordHistory}
            onUpdateRecordStatus={onUpdateRecordStatus}
            rows={visibleRecords}
          />
        </div>
      )}
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
  onUpdateRecordStatus: (row: InventoryCustodyRecordDto, status: string, documentId?: string) => Promise<void>;
  rows: InventoryCustodyRecordDto[];
}) {
  return (
    <table className="inventory-custody-lines-table">
      <thead>
        <tr>
          <th>Позиция</th>
          <th>Склад</th>
          <th>Кол-во</th>
          <th>Выдано</th>
          <th>Статус</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const documentId = documentIdByRecordId.get(row.id);
          return (
            <tr key={row.id}>
              <td><strong>{row.itemName}</strong><span>{row.comment || row.employeeName}</span></td>
              <td>{row.warehouseName || "Не указан"}</td>
              <td>{formatQuantity(row.quantity)} {row.unit || ""}</td>
              <td>{formatDate(row.issuedAt)}</td>
              <td><CustodyStatus scope="record" status={row.status} /></td>
              <td>
                <div className="inventory-custody-line-actions">
                  <button className="button ghost" disabled={busyAction === `history-${row.id}`} onClick={() => void onOpenRecordHistory(row)} type="button">
                    <History size={15} />
                    История
                  </button>
                  <button className="button ghost" disabled={row.status !== "in_use" || busyAction === `returned-${row.id}`} onClick={() => void onUpdateRecordStatus(row, "returned", documentId)} type="button">
                    <RotateCcw size={15} />
                    Вернуть
                  </button>
                  <button className="button ghost danger" disabled={["returned", "written_off", "lost"].includes(row.status) || busyAction === `written_off-${row.id}`} onClick={() => void onUpdateRecordStatus(row, "written_off", documentId)} type="button">
                    <Trash2 size={15} />
                    Списать
                  </button>
                  <button className="button ghost danger" disabled={busyAction === `archive-${row.id}`} onClick={() => void onArchiveRecord(row, documentId)} type="button">
                    <Archive size={15} />
                    Архив
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CustodyKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-custody-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
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
    [row.employeeName, row.itemName, row.warehouseName, recordStatusLabel(row.status), row.status].join(" ").toLowerCase().includes(normalized),
  );
}

