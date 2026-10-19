import { Archive, History, Lock, Unlock } from "lucide-react";
import type { InventoryCustodyRecordDto, InventoryEmployeeDto, InventoryHistoryDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import {
  CustodyState,
  CustodyStatus,
  Meta,
  actionLabel,
  documentStatusLabel,
  entityLabel,
  formatDate,
  statusDescription,
} from "./custodyCommon";
import { ModalShell } from "../../../shared/ui";
import { CustodyRecordTable } from "./custodyJournal";
import type { CustodyDocumentAction, CustodyDrawer } from "./custodyTypes";

export function CustodyDetailDrawer({
  busyAction,
  pending = false,
  actionError,
  drawer,
  employees,
  onArchiveRecord,
  onClose,
  onDownload,
  onOpenRecordHistory,
  onTransferRecord,
  onUpdateDocumentState,
  onUpdateRecordStatus,
}: {
  busyAction: string;
  pending?: boolean;
  actionError?: string;
  drawer: CustodyDrawer;
  employees: InventoryEmployeeDto[];
  onArchiveRecord: (row: InventoryCustodyRecordDto, documentId?: string) => Promise<void | boolean>;
  onClose: () => void;
  onDownload: (action: () => Promise<{ blob: Blob; fileName: string }>) => Promise<void>;
  onOpenRecordHistory: (row: InventoryCustodyRecordDto) => Promise<void>;
  onTransferRecord: (row: InventoryCustodyRecordDto, employeeId: string, documentId?: string, comment?: string) => Promise<void | boolean>;
  onUpdateDocumentState: (documentId: string, action: CustodyDocumentAction) => Promise<void | boolean>;
  onUpdateRecordStatus: (row: InventoryCustodyRecordDto, status: string, documentId?: string, comment?: string) => Promise<void | boolean>;
}) {
  const inventoryRepository = useInventoryRepository();
  if (!drawer) return null;

  const title = drawer.type === "document"
    ? `Акт под запись: ${drawer.detail.number}`
    : drawer.title;

  return <ModalShell title={title} subtitle={drawer.type === "document" ? "Детали акта под запись" : "История операций"} className="custody-document-dialog" pending={pending} onClose={onClose}
    actions={<>
        {drawer.type === "document" ? (
          <div className="custody-document-actions">
            {drawer.detail.status === "closed" ? (
              <button className="button ghost" disabled={Boolean(busyAction)} onClick={() => void onUpdateDocumentState(drawer.detail.id, "open")} type="button">
                <Unlock size={15} />
                Открыть
              </button>
            ) : (
              <button className="button ghost" disabled={Boolean(busyAction)} onClick={() => void onUpdateDocumentState(drawer.detail.id, "close")} type="button">
                <Lock size={15} />
                Закрыть
              </button>
            )}
            <button className="button ghost danger" disabled={Boolean(busyAction)} onClick={() => void onUpdateDocumentState(drawer.detail.id, "archive")} type="button">
              <Archive size={15} />
              Архив
            </button>
            <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printCustodyDocument(drawer.detail.id, "pdf"))} type="button">PDF</button>
            <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printCustodyDocument(drawer.detail.id, "docx"))} type="button">DOCX</button>
          </div>
        ) : null}


      <button className="button ghost" disabled={pending} onClick={onClose} type="button">Закрыть просмотр</button>
    </>}>
    {actionError ? <p role="alert" className="field-error">{actionError}</p> : null}
        <div className="custody-document-content">
          {drawer.type === "document" ? (
            <>
              <section className="inventory-custody-drawer-meta">
                <Meta label="Номер" value={drawer.detail.number} />
                <Meta label="Сотрудник" value={drawer.detail.employeeName} />
                <Meta label="Табельный" value={drawer.detail.employeePersonnelNo || "Не указан"} />
                <Meta label="Подразделение" value={drawer.detail.employeeDepartment || "Не указано"} />
                <Meta label="Статус" value={documentStatusLabel(drawer.detail.status)} />
                <Meta label="Дата" value={formatDate(drawer.detail.createdAt)} />
                <Meta label="Закрыт" value={drawer.detail.closedAt ? formatDate(drawer.detail.closedAt) : "Не закрыт"} />
                <Meta label="Строк" value={String(drawer.detail.records.length)} />
              </section>

              <section className="inventory-custody-card-section">
                <div className="inventory-custody-section-head">
                  <h3>Строки акта</h3>
                  <span>{drawer.detail.records.length} строк</span>
                </div>
                {!drawer.detail.records.length ? (
                  <CustodyState kind="empty" text="Добавьте выдачу под запись в верхней форме экрана." title="В акте пока нет строк" />
                ) : (
                  <div className="inventory-custody-lines-wrap">
                    <CustodyRecordTable
                      busyAction={busyAction}
                      documentIdByRecordId={new Map(drawer.detail.records.map((row) => [row.id, drawer.detail.id]))}
                      employees={employees}
                      onArchiveRecord={onArchiveRecord}
                      onOpenRecordHistory={onOpenRecordHistory}
                      onTransferRecord={onTransferRecord}
                      onUpdateRecordStatus={onUpdateRecordStatus}
                      rows={drawer.detail.records}
                    />
                  </div>
                )}
              </section>

              <section className="inventory-custody-card-section is-secondary">
                <div className="inventory-custody-section-head">
                  <h3>История акта</h3>
                  <span>{drawer.detail.history.length} событий</span>
                </div>
                <CustodyHistoryTable rows={drawer.detail.history} />
              </section>
            </>
          ) : (
            <>
              {drawer.meta?.length ? (
                <section className="inventory-custody-drawer-meta">
                  {drawer.meta.map(([label, value]) => <Meta key={label} label={label} value={value} />)}
                </section>
              ) : null}
              <section className="inventory-custody-card-section is-secondary">
                <div className="inventory-custody-section-head">
                  <h3>История строки</h3>
                  <span>{drawer.rows.length} событий</span>
                </div>
                <CustodyHistoryTable rows={drawer.rows} />
              </section>
            </>
          )}
        </div>
  </ModalShell>;
}

function CustodyHistoryTable({ rows }: { rows: InventoryHistoryDto[] }) {
  if (!rows.length) {
    return <CustodyState kind="empty" text="Для выбранной сущности событий еще нет." title="История пока пуста" />;
  }

  return (
    <div className="inventory-custody-history-wrap">
      <table className="inventory-custody-history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сущность</th>
            <th>Действие</th>
            <th>Описание</th>
            <th>Пользователь</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Дата">{formatDate(row.createdAt)}</td>
              <td data-label="Сущность">{entityLabel(row.entityType)}</td>
              <td data-label="Действие">{actionLabel(row.action)}</td>
              <td data-label="Описание">{row.description?.trim() && row.description.trim() !== "->" ? statusDescription(row.description) : "Без описания"}</td>
              <td data-label="Пользователь">{row.actor || "Система"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
