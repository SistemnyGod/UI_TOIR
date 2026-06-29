import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { InventoryHistoryDto, InventoryItemDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import {
  Meta,
  printDataFromDetail,
  statusLabel,
  validatePpeEmployeePrintDetails,
} from "./ppeCommon";
import { PpeCardLinesTable, PpeHistoryTable } from "./PpeDrawerTables";
import type { ApiFile, PpeDrawer, PrintData, PrintMode } from "./ppeTypes";

export function PpeDrawerPanel({
  busyAction,
  drawer,
  items,
  onClose,
  onDownload,
  onLineHistory,
  onLineStatus,
  onPreview,
  onPrint,
}: {
  busyAction: string;
  drawer: PpeDrawer;
  items: InventoryItemDto[];
  onClose: () => void;
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onLineHistory: (cardId: string, line: InventoryPpeCardLineDto) => Promise<void>;
  onLineStatus: (cardId: string, lineId: string, status: string) => Promise<void>;
  onPreview: (data: PrintData, mode: PrintMode) => void;
  onPrint: (data: PrintData, mode: PrintMode) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  if (!drawer) return null;
  const cardPrintData = drawer.type === "card" ? printDataFromDetail(drawer.detail, items) : null;
  const employeePrintErrors = cardPrintData ? validatePpeEmployeePrintDetails(cardPrintData.employeeDetails) : [];
  const isPrintBlockedByEmployeeDetails = employeePrintErrors.length > 0;
  const printBlockTitle = isPrintBlockedByEmployeeDetails
    ? "Заполните поля личной карточки сотрудника перед печатью."
    : undefined;

  return createPortal(
    <div className="inventory-ppe-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="inventory-ppe-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Детали СИЗ">
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
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => onPreview(cardPrintData!, "card")} title={printBlockTitle} type="button">Предпросмотр карточки</button>
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => onPreview(cardPrintData!, "sheet")} title={printBlockTitle} type="button">Предпросмотр листа</button>
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => onPrint(cardPrintData!, "card")} title={printBlockTitle} type="button">Печать карточки</button>
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => onPrint(cardPrintData!, "sheet")} title={printBlockTitle} type="button">Печать листа</button>
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => void onDownload(() => inventoryRepository.printPpeCard(drawer.detail.id, "card", "docx"))} title={printBlockTitle} type="button">Карточка DOCX</button>
              <button className="button ghost" disabled={isPrintBlockedByEmployeeDetails} onClick={() => void onDownload(() => inventoryRepository.printPpeCard(drawer.detail.id, "sheet", "docx"))} title={printBlockTitle} type="button">Лист DOCX</button>
            </div>            <div className="inventory-ppe-drawer-body">
              {employeePrintErrors.length ? (
                <div className="inventory-ppe-inline-warning inventory-ppe-print-validation" role="alert">
                  <strong>Перед печатью заполните поля личной карточки</strong>
                  <ul>
                    {employeePrintErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
                <PpeCardLinesTable
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
                <PpeHistoryTable rows={drawer.history} />
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
              <PpeHistoryTable rows={drawer.rows} />
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}

