import { MoreHorizontal } from "lucide-react";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import type { InventoryEmployeeDto, InventoryPpeCardDto } from "../../../api/contracts";
import { formatMoney, getInitials, Meta, PpeKpi, PpeState, PpeStatus, statusLabel } from "./ppeCommon";
import type { ApiFile, PrintMode } from "./ppeTypes";

export { PpeKpi };

export function CardJournalTable({
  busyAction,
  onEdit,
  onOpen,
  onPreview,
  employeesById,
  rows,
  selectedCardId,
  setSelectedCardId,
}: {
  busyAction: string;
  onEdit: (id: string) => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onPreview: (id: string, mode: PrintMode) => Promise<void>;
  employeesById?: Map<string, InventoryEmployeeDto>;
  rows: InventoryPpeCardDto[];
  selectedCardId: string;
  setSelectedCardId: (id: string) => void;
}) {
  return (
    <div className="inventory-ppe-card-list" role="list">
      {rows.map((row) => {
        const employee = employeesById?.get(row.employeeId);
        const selected = selectedCardId === row.id;
        return (
          <article
            aria-current={selected ? "true" : undefined}
            className={`inventory-ppe-card-row ${selected ? "is-selected" : ""}`}
            key={row.id}
            onClick={() => setSelectedCardId(row.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedCardId(row.id);
              }
            }}
            role="listitem"
            tabIndex={0}
          >
            <div className="inventory-ppe-card-row-id">
              <strong>СИЗ-{row.id.slice(0, 8)}</strong>
              <span>{row.linesCount} позиций</span>
            </div>
            <div className="inventory-ppe-card-row-person">
              <strong>{row.employeeName}</strong>
              <span>{employee?.personnelNo || row.employeeId.slice(0, 8)}</span>
            </div>
            <div className="inventory-ppe-card-row-work">
              <span>{employee?.department || "Подразделение не указано"}</span>
              <strong>{row.position || "Должность не указана"}</strong>
            </div>
            <div className="inventory-ppe-card-row-status">
              <PpeStatus status={row.status} />
              {row.zeroPriceLines > 0 ? <span className="inventory-ppe-price-warning">Без цены: {row.zeroPriceLines}</span> : null}
            </div>
            <div className="inventory-ppe-card-row-total">
              <span>Сумма</span>
              <strong>{formatMoney((row.amountMinor ?? 0) / 100)}</strong>
            </div>
            <div className="inventory-ppe-row-actions inventory-ppe-row-actions-compact">
              <button
                className="button ghost"
                disabled={busyAction === `open-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpen(row.id);
                }}
                type="button"
              >
                Открыть
              </button>
              <button
                className="button ghost"
                disabled={busyAction === `preview-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onPreview(row.id, "card");
                }}
                type="button"
              >
                Печать
              </button>
              <button
                className="inventory-ppe-more-button"
                disabled={busyAction === `edit-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onEdit(row.id);
                }}
                title="Редактировать"
                type="button"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function PpeInspector({
  card,
  employee,
  onDownload,
  onEdit,
  onOpen,
  onOpenHistory,
  onPreview,
}: {
  card: InventoryPpeCardDto | null;
  employee?: InventoryEmployeeDto | null;
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onEdit: (cardId: string) => void;
  onOpen: (cardId: string) => void;
  onOpenHistory: (cardId: string) => void;
  onPreview: (cardId: string, mode: PrintMode) => void;
}) {
  const inventoryRepository = useInventoryRepository();

  if (!card) {
    return (
      <aside className="inventory-ppe-inspector">
        <PpeState kind="empty" title="Карточка не выбрана" text="Выберите карточку в журнале или создайте новую." />
      </aside>
    );
  }

  return (
    <aside className="inventory-ppe-inspector">
      <div className="inventory-ppe-profile">
        <span>{getInitials(card.employeeName)}</span>
        <div>
          <strong>{card.employeeName}</strong>
          <small>СИЗ-{card.id.slice(0, 8)}</small>
        </div>
      </div>
      <div className="inventory-ppe-meta-grid">
        <Meta label="Должность" value={card.position || "Не указана"} />
        <Meta label="Подразделение" value={employee?.department || "Не указано"} />
        <Meta label="Табельный" value={employee?.personnelNo || "Не указан"} />
        <Meta label="Статус" value={statusLabel(card.status)} />
        <Meta label="Позиции" value={String(card.linesCount)} />
        <Meta label="Сумма" value={formatMoney((card.amountMinor ?? 0) / 100)} />
        {card.zeroPriceLines > 0 ? <Meta label="Проверить цену" value={String(card.zeroPriceLines)} /> : null}
      </div>
      <div className="inventory-ppe-inspector-actions">
        <button className="button primary" onClick={() => onOpen(card.id)} type="button">
          Открыть карточку
        </button>
        <button className="button ghost" onClick={() => onEdit(card.id)} type="button">
          Редактировать
        </button>
        <button className="button ghost" onClick={() => onPreview(card.id, "card")} type="button">
          Предпросмотр карточки
        </button>
        <button className="button ghost" onClick={() => onPreview(card.id, "sheet")} type="button">
          Лист подписи
        </button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(card.id, "card", "docx"))} type="button">
          DOCX карточка
        </button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(card.id, "sheet", "docx"))} type="button">
          DOCX лист
        </button>
        <button className="button ghost is-wide" onClick={() => onOpenHistory(card.id)} type="button">
          История строк
        </button>
      </div>
      <section className="inventory-ppe-print-preview">
        <strong>Печатные формы</strong>
        <span>Проверьте личную карточку и лист подписи перед DOCX или печатью.</span>
        <div className="inventory-ppe-print-summary">
          <span>{card.linesCount}</span>
          <small>строк в карточке</small>
        </div>
      </section>
    </aside>
  );
}
