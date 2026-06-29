import { useEffect, useMemo, useState } from "react";
import type { InventoryListResponseDto, InventoryPpeMovementDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";

type PpeMovementHistoryPanelProps = {
  employeeId?: string;
  emptyText?: string;
  hideEmployee?: boolean;
  hideItem?: boolean;
  itemId?: string;
  pageSize?: number;
  title: string;
};

export function PpeMovementHistoryPanel({
  employeeId,
  emptyText = "Движений СИЗ пока нет.",
  hideEmployee = false,
  hideItem = false,
  itemId,
  pageSize = 10,
  title,
}: PpeMovementHistoryPanelProps) {
  const inventoryRepository = useInventoryRepository();
  const [rows, setRows] = useState<InventoryPpeMovementDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const params = useMemo(
    () => ({ employeeId, itemId, page: 1, pageSize }),
    [employeeId, itemId, pageSize],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    inventoryRepository
      .getPpeMovements(params)
      .then((response: InventoryListResponseDto<InventoryPpeMovementDto>) => {
        if (!mounted) return;
        setRows(response.rows);
        setTotal(response.total);
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить историю движения СИЗ");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository, params]);

  return (
    <section className="inventory-ppe-movements-panel">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{loading ? "Загрузка..." : `${rows.length} из ${total} записей`}</p>
        </div>
      </header>

      {error ? <div className="inventory-ppe-movements-state is-error">{error}</div> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="inventory-ppe-movements-state">{emptyText}</div>
      ) : null}

      {rows.length > 0 ? (
        <div className="inventory-ppe-movements-table-wrap">
          <table className="inventory-ppe-movements-table">
            <thead>
              <tr>
                <th>Дата</th>
                {!hideEmployee ? <th>Сотрудник</th> : null}
                {!hideItem ? <th>Предмет</th> : null}
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
                <th>Срок</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.lineId}>
                  <td>{formatDate(row.issuedAt ?? row.createdAt)}</td>
                  {!hideEmployee ? (
                    <td>
                      <strong>{row.employeeName}</strong>
                      <span>{row.employeePersonnelNo || row.employeeDepartment || "-"}</span>
                    </td>
                  ) : null}
                  {!hideItem ? (
                    <td>
                      <strong>{row.itemName}</strong>
                      <span>{row.returnedAt ? `Возврат: ${formatDate(row.returnedAt)}` : row.writtenOffAt ? `Списание: ${formatDate(row.writtenOffAt)}` : row.comment}</span>
                    </td>
                  ) : null}
                  <td>{formatQuantity(row.quantity, row.unit)}</td>
                  <td className={row.unitPriceMinor ? undefined : "inventory-ppe-movement-warning"}>{formatMoney(row.unitPriceMinor)}</td>
                  <td>{formatMoney(row.amountMinor)}</td>
                  <td>{row.dueAt ? formatDate(row.dueAt) : "-"}</td>
                  <td><span className={`inventory-ppe-movement-status is-${row.status}`}>{statusLabel(row.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(date);
}

function formatMoney(minor: number | null | undefined) {
  return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format((minor ?? 0) / 100);
}

function formatQuantity(value: number, unit: string) {
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
  return `${formatted} ${unit || "шт."}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    issued: "Выдано",
    issuing: "К выдаче",
    lost: "Утеряно",
    not_issued: "Не выдано",
    returned: "Возвращено",
    warning: "Проблема",
    written_off: "Списано",
  };
  return labels[status] ?? status;
}
