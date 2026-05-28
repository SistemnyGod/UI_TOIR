import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import type { InventoryHistoryDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { formatDate, formatQuantity, Meta, PpeState, PpeStatus, printDataFromDetail, statusLabel } from "./ppeCommon";
import type { ApiFile, PpeDrawer, PrintData, PrintMode } from "./ppeTypes";

export function PpeDrawerPanel({
  busyAction,
  drawer,
  onClose,
  onDownload,
  onLineHistory,
  onLineStatus,
  onPreview,
  onPrint,
}: {
  busyAction: string;
  drawer: PpeDrawer;
  onClose: () => void;
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onLineHistory: (cardId: string, line: InventoryPpeCardLineDto) => Promise<void>;
  onLineStatus: (cardId: string, lineId: string, status: string) => Promise<void>;
  onPreview: (data: PrintData, mode: PrintMode) => void;
  onPrint: (data: PrintData, mode: PrintMode) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  if (!drawer) return null;

  return createPortal(
    <div className="inventory-ppe-drawer-backdrop" role="presentation">
      <aside className="inventory-ppe-drawer" aria-label="Детали СИЗ">
        {drawer.type === "card" ? (
          <>
            <header className="inventory-ppe-drawer-header">
              <div>
                <p>Карточка СИЗ</p>
                <h2>{drawer.detail.employeeName}</h2>
              </div>
              <button className="inventory-ppe-icon-button" onClick={onClose} type="button">
                <X size={20} />
              </button>
            </header>
            <div className="inventory-ppe-drawer-toolbar">
              <button className="button ghost" onClick={() => onPreview(printDataFromDetail(drawer.detail), "card")} type="button">Предпросмотр карточки</button>
              <button className="button ghost" onClick={() => onPreview(printDataFromDetail(drawer.detail), "sheet")} type="button">Предпросмотр росписи</button>
              <button className="button ghost" onClick={() => onPrint(printDataFromDetail(drawer.detail), "card")} type="button">Печать карточки</button>
              <button className="button ghost" onClick={() => onPrint(printDataFromDetail(drawer.detail), "sheet")} type="button">Печать росписи</button>
              <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(drawer.detail.id, "card", "docx"))} type="button">Карточка DOCX</button>
              <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(drawer.detail.id, "sheet", "docx"))} type="button">Роспись DOCX</button>
            </div>
            <div className="inventory-ppe-drawer-body">
              <div className="inventory-ppe-drawer-meta">
                <Meta label="Номер" value={`СИЗ-${drawer.detail.id.slice(0, 8)}`} />
                <Meta label="Должность" value={drawer.detail.position || "Не указана"} />
                <Meta label="Статус" value={statusLabel(drawer.detail.status)} />
                <Meta label="Строк" value={String(drawer.detail.lines.length)} />
              </div>
              <section className="inventory-ppe-card-section">
                <div className="inventory-ppe-section-head">
                  <h3>Строки СИЗ</h3>
                  <span>{drawer.detail.lines.length} строк</span>
                </div>
                <CardLinesTable
                  busyAction={busyAction}
                  cardId={drawer.detail.id}
                  lines={drawer.detail.lines}
                  onLineHistory={onLineHistory}
                  onLineStatus={onLineStatus}
                />
              </section>
              <section className="inventory-ppe-card-section is-secondary">
                <div className="inventory-ppe-section-head">
                  <h3>История карточки</h3>
                  <span>{drawer.history.length} событий</span>
                </div>
                <HistoryTable rows={drawer.history} />
              </section>
            </div>
          </>
        ) : (
          <>
            <header className="inventory-ppe-drawer-header">
              <div>
                <p>История</p>
                <h2>{drawer.title}</h2>
              </div>
              <button className="inventory-ppe-icon-button" onClick={onClose} type="button">
                <X size={20} />
              </button>
            </header>
            <div className="inventory-ppe-drawer-body">
              {drawer.meta ? (
                <div className="inventory-ppe-drawer-meta">
                  {drawer.meta.map(([label, value]) => <Meta key={label} label={label} value={value} />)}
                </div>
              ) : null}
              <HistoryTable rows={drawer.rows} />
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}

function CardLinesTable({
  busyAction,
  cardId,
  lines,
  onLineHistory,
  onLineStatus,
}: {
  busyAction: string;
  cardId: string;
  lines: InventoryPpeCardLineDto[];
  onLineHistory: (cardId: string, line: InventoryPpeCardLineDto) => Promise<void>;
  onLineStatus: (cardId: string, lineId: string, status: string) => Promise<void>;
}) {
  if (!lines.length) {
    return <PpeState kind="empty" title="Строк СИЗ нет" text="Добавьте позиции через мастер карточки." />;
  }

  return (
    <div className="inventory-ppe-lines-wrap">
      <table className="inventory-ppe-lines-table">
        <thead>
          <tr>
            <th>Позиция</th>
            <th>Склад</th>
            <th>Кол-во</th>
            <th>Выдано</th>
            <th>Срок</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td><strong>{line.itemName}</strong><span>{line.unit || "шт."}</span></td>
              <td>{line.warehouseName || "Не указан"}</td>
              <td>{formatQuantity(line.quantity)}</td>
              <td>{formatDate(line.issuedAt, "date")}</td>
              <td>{formatDate(line.dueAt, "date")}</td>
              <td><PpeStatus status={line.status} /></td>
              <td>
                <div className="inventory-ppe-line-actions">
                  <button className="button ghost" onClick={() => void onLineHistory(cardId, line)} type="button"><History size={15} /> История</button>
                  <button className="button ghost" disabled={busyAction === `issued-${line.id}`} onClick={() => void onLineStatus(cardId, line.id, "issued")} type="button">Выдать</button>
                  <button className="button ghost" disabled={busyAction === `returned-${line.id}`} onClick={() => void onLineStatus(cardId, line.id, "returned")} type="button">Вернуть</button>
                  <button className="button ghost danger" disabled={busyAction === `written_off-${line.id}`} onClick={() => void onLineStatus(cardId, line.id, "written_off")} type="button">Списать</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ rows }: { rows: InventoryHistoryDto[] }) {
  if (!rows.length) {
    return <PpeState kind="empty" title="Истории пока нет" text="События появятся после действий с карточкой или строками." />;
  }

  return (
    <div className="inventory-ppe-history-wrap">
      <table className="inventory-ppe-history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Действие</th>
            <th>Описание</th>
            <th>Автор</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.action}</td>
              <td>{row.description}</td>
              <td>{row.actor || "Система"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

