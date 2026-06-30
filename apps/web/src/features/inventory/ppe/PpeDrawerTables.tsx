import { createPortal } from "react-dom";
import { useState } from "react";
import type { MouseEvent } from "react";
import { History, MoreHorizontal } from "lucide-react";
import type { InventoryHistoryDto, InventoryPpeCardLineDto } from "../../../api/contracts";
import { formatDate, formatMoney, formatQuantity, PpeState, PpeStatus } from "./ppeCommon";

export function PpeCardLinesTable({
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
  const [commandMenu, setCommandMenu] = useState<{
    left: number;
    line: InventoryPpeCardLineDto;
    top: number;
  } | null>(null);

  if (!lines.length) {
    return <PpeState kind="empty" title="Строк СИЗ нет" text="Добавьте позиции через мастер карточки." />;
  }

  function openCommandMenu(event: MouseEvent<HTMLButtonElement>, line: InventoryPpeCardLineDto) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 158;
    const gap = 8;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const shouldOpenUp = rect.bottom + gap + menuHeight > window.innerHeight;
    const top = shouldOpenUp ? Math.max(8, rect.top - menuHeight - gap) : rect.bottom + gap;

    setCommandMenu({ left, line, top });
  }

  function closeCommandMenu() {
    setCommandMenu(null);
  }

  return (
    <>
      <div className="inventory-ppe-lines-wrap" onScroll={closeCommandMenu}>
        <table className="inventory-ppe-lines-table">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Кол-во</th>
              <th>Цена</th>
              <th>Сумма</th>
              <th>Выдано</th>
              <th>Срок</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const unitPrice = (line.unitPriceMinor ?? 0) / 100;
              const amount = (line.amountMinor ?? 0) / 100;

              return (
                <tr className={unitPrice === 0 ? "has-warning" : ""} key={line.id}>
                  <td>
                    <strong>{line.itemName}</strong>
                    <span>{line.unit || "шт."}</span>
                  </td>
                  <td>{formatQuantity(line.quantity)}</td>
                  <td>
                    {formatMoney(unitPrice)}
                    {unitPrice === 0 ? <span className="inventory-ppe-field-warning">Требует цены</span> : null}
                  </td>
                  <td>{formatMoney(amount)}</td>
                  <td>{formatDate(line.issuedAt, "date")}</td>
                  <td>{formatDate(line.dueAt, "date")}</td>
                  <td><PpeStatus status={line.status} /></td>
                  <td>
                    <button
                      aria-expanded={commandMenu?.line.id === line.id}
                      aria-haspopup="menu"
                      aria-label={`Действия по позиции ${line.itemName}`}
                      className="inventory-ppe-line-menu-button"
                      onClick={(event) => openCommandMenu(event, line)}
                      type="button"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {commandMenu
        ? createPortal(
            <div className="inventory-ppe-command-layer" onMouseDown={closeCommandMenu} role="presentation">
              <div
                className="inventory-ppe-command-menu"
                onMouseDown={(event) => event.stopPropagation()}
                role="menu"
                style={{ left: commandMenu.left, top: commandMenu.top }}
              >
                <button
                  onClick={() => {
                    closeCommandMenu();
                    void onLineHistory(cardId, commandMenu.line);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <History size={15} />
                  История
                </button>
                <button
                  disabled={busyAction === `issued-${commandMenu.line.id}`}
                  onClick={() => {
                    closeCommandMenu();
                    void onLineStatus(cardId, commandMenu.line.id, "issued");
                  }}
                  role="menuitem"
                  type="button"
                >
                  Выдать
                </button>
                <button
                  disabled={busyAction === `returned-${commandMenu.line.id}`}
                  onClick={() => {
                    closeCommandMenu();
                    void onLineStatus(cardId, commandMenu.line.id, "returned");
                  }}
                  role="menuitem"
                  type="button"
                >
                  Вернуть
                </button>
                <button
                  className="danger"
                  disabled={busyAction === `written_off-${commandMenu.line.id}`}
                  onClick={() => {
                    closeCommandMenu();
                    void onLineStatus(cardId, commandMenu.line.id, "written_off");
                  }}
                  role="menuitem"
                  type="button"
                >
                  Списать
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function PpeHistoryTable({ rows }: { rows: InventoryHistoryDto[] }) {
  if (!rows.length) {
    return <PpeState kind="empty" title="Истории пока нет" text="События появятся после действий с карточкой или строками." />;
  }

  return (
    <div className="inventory-ppe-history-wrap">
      <table className="inventory-ppe-history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сотрудник</th>
            <th>СИЗ</th>
            <th>Действие</th>
            <th>Описание</th>
            <th>Автор</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.employeeName || "Не указан"}</td>
              <td>{row.itemName || "Не указано"}</td>
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
