import { useRef, useState } from "react";
import type { RouteDirectoryItem, RoutePoint } from "../../../../types";
import { CompactTable, type CompactTableColumn } from "../../../../shared/ui";

type MaybePromise<T> = T | Promise<T>;

export function RoutePointTable({
  canManage = true,
  points,
  route,
  selectedPointId,
  onMovePoint,
  onSelectPoint,
}: {
  canManage?: boolean;
  points: RoutePoint[];
  route: RouteDirectoryItem;
  selectedPointId: string;
  onMovePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  onSelectPoint: (id: string) => void;
}) {
  const [moving, setMoving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const orderedIds = [...route.points].sort((a, b) => a.order - b.order).map(point => point.id);
  async function move(point: RoutePoint, direction: -1 | 1) {
    if (busy.current || !canManage) return;
    busy.current = true;
    setMoving(true);
    setError("");
    try { await onMovePoint(route.id, point.id, direction); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось изменить порядок точек. Повторите попытку."); }
    finally { busy.current = false; setMoving(false); }
  }
  const columns: CompactTableColumn<RoutePoint>[] = [
    { key: "order", header: "№", render: (point) => <span className="route-order-number">{point.order}</span>, width: "44px" },
    {
      key: "name",
      header: "Точка",
      render: (point) => (
        <button
          aria-pressed={selectedPointId === point.id}
          aria-label={`Открыть точку: ${point.name}`}
          className="route-point-select"
          onClick={(event) => {
            event.stopPropagation();
            onSelectPoint(point.id);
          }}
          type="button"
        >
          <strong>{point.name}</strong>
          <small>{point.zone || "Зона не указана"}</small>
          <span className="route-point-description-cell">{point.description || point.instruction || "Описание не добавлено"}</span>
        </button>
      ),
    },
    { key: "tag", header: "Тип и метка", render: (point) => <div className="route-tag-cell"><strong>{point.type}</strong><span className={!point.tag.trim() && point.type !== "Ручной контроль" ? "route-tag-missing" : ""}>{point.tag || (point.type === "Ручной контроль" ? "Без сканирования" : "Метка не задана")}</span></div>, width: "170px" },
    {
      key: "actions",
      header: "Порядок",
      render: (point) => (
        <div className="order-actions">
          <button
            aria-label={`Переместить точку «${point.name}» выше`}
            className="icon-button mini-icon"
            disabled={!canManage || moving || orderedIds[0] === point.id}
            onClick={(event) => {
              event.stopPropagation();
              void move(point, -1);
            }}
            type="button"
          >
            ↑
          </button>
          <button
            aria-label={`Переместить точку «${point.name}» ниже`}
            className="icon-button mini-icon"
            disabled={!canManage || moving || orderedIds.at(-1) === point.id}
            onClick={(event) => {
              event.stopPropagation();
              void move(point, 1);
            }}
            type="button"
          >
            ↓
          </button>
        </div>
      ),
      align: "center",
      width: "100px",
    },
  ];

  return (
    <>
    {error ? <p className="route-form-error" role="alert">{error}</p> : null}
    <CompactTable
      className="route-points-compact-table"
      columns={columns}
      emptyText="Точки не найдены. Измените поиск или фильтр."
      getRowClassName={(point) => selectedPointId === point.id ? "selected" : ""}
      getRowKey={(point) => point.id}
      onRowClick={(point) => onSelectPoint(point.id)}
      rows={points}
    />
    </>
  );
}
