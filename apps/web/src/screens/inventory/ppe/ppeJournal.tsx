import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import type { InventoryPpeCardDto } from "../../../api/contracts";
import { getInitials, Meta, PpeKpi, PpeState, PpeStatus, statusLabel } from "./ppeCommon";
import type { ApiFile, PrintMode } from "./ppeTypes";

export { PpeKpi };

export function CardJournalTable({
  busyAction,
  onEdit,
  onOpen,
  onPreview,
  rows,
  selectedCardId,
  setSelectedCardId,
}: {
  busyAction: string;
  onEdit: (id: string) => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onPreview: (id: string, mode: PrintMode) => Promise<void>;
  rows: InventoryPpeCardDto[];
  selectedCardId: string;
  setSelectedCardId: (id: string) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  return (
    <div className="inventory-ppe-table-wrap">
      <table className="inventory-ppe-table">
        <thead>
          <tr>
            <th>№ карточки</th>
            <th>Сотрудник</th>
            <th>Должность</th>
            <th>Статус</th>
            <th>Позиции</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={selectedCardId === row.id ? "is-selected" : ""} key={row.id} onClick={() => setSelectedCardId(row.id)}>
              <td>
                <strong>СИЗ-{row.id.slice(0, 8)}</strong>
                <span>{row.linesCount} позиций</span>
              </td>
              <td>
                <strong>{row.employeeName}</strong>
                <span>{row.employeeId.slice(0, 8)}</span>
              </td>
              <td>{row.position || "Не указана"}</td>
              <td>
                <PpeStatus status={row.status} />
              </td>
              <td>{row.linesCount}</td>
              <td>
                <div className="inventory-ppe-row-actions">
                  <button
                    className="button ghost"
                    disabled={busyAction === `open-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onOpen(row.id);
                    }}
                    type="button"
                  >
                    Просмотр
                  </button>
                  <button
                    className="button ghost"
                    disabled={busyAction === `edit-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onEdit(row.id);
                    }}
                    type="button"
                  >
                    Редактировать
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PpeInspector({
  card,
  onDownload,
  onEdit,
  onOpen,
  onOpenHistory,
  onPreview,
}: {
  card: InventoryPpeCardDto | null;
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
        <Meta label="Статус" value={statusLabel(card.status)} />
        <Meta label="Позиции" value={String(card.linesCount)} />
      </div>
      <div className="inventory-ppe-inspector-actions">
        <button className="button primary" onClick={() => onOpen(card.id)} type="button">Просмотр</button>
        <button className="button ghost" onClick={() => onEdit(card.id)} type="button">Редактировать</button>
        <button className="button ghost" onClick={() => onPreview(card.id, "card")} type="button">Предпросмотр</button>
        <button className="button ghost" onClick={() => onPreview(card.id, "sheet")} type="button">Роспись получения</button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(card.id, "card", "docx"))} type="button">
          Карточка DOCX
        </button>
        <button className="button ghost" onClick={() => void onDownload(() => inventoryRepository.printPpeCard(card.id, "sheet", "docx"))} type="button">
          Роспись DOCX
        </button>
        <button className="button ghost" onClick={() => onOpenHistory(card.id)} type="button">История строк</button>
      </div>
      <section className="inventory-ppe-print-preview">
        <strong>Предпросмотр</strong>
        <span>Откройте личную карточку или роспись получения, проверьте форму и распечатайте.</span>
        <table>
          <tbody>
            <tr><td>Сотрудник</td><td>{card.employeeName}</td></tr>
            <tr><td>Позиции</td><td>{card.linesCount}</td></tr>
          </tbody>
        </table>
      </section>
    </aside>
  );
}

