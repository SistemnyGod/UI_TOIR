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
  const columns: CompactTableColumn<RoutePoint>[] = [
    { key: "order", header: "№", render: (point) => point.order, align: "right", width: "64px" },
    {
      key: "name",
      header: "Точка",
      render: (point) => (
        <button
          aria-pressed={selectedPointId === point.id}
          className="route-point-select"
          onClick={(event) => {
            event.stopPropagation();
            onSelectPoint(point.id);
          }}
          type="button"
        >
          {point.name}
        </button>
      ),
      width: "220px",
    },
    { key: "zone", header: "Зона", render: (point) => point.zone || "-", width: "150px" },
    { key: "type", header: "Тип", render: (point) => point.type, width: "110px" },
    { key: "tag", header: "NFC / тег", render: (point) => point.tag || "-", width: "150px" },
    { key: "description", header: "Описание", render: (point) => <span className="route-point-description-cell">{point.description || point.instruction || "—"}</span>, width: "280px" },
    {
      key: "actions",
      header: "Порядок",
      render: (point) => (
        <div className="order-actions">
          <button
            aria-label={`Переместить точку «${point.name}» выше`}
            className="icon-button mini-icon"
            disabled={!canManage}
            onClick={(event) => {
              event.stopPropagation();
              void onMovePoint(route.id, point.id, -1);
            }}
            type="button"
          >
            ↑
          </button>
          <button
            aria-label={`Переместить точку «${point.name}» ниже`}
            className="icon-button mini-icon"
            disabled={!canManage}
            onClick={(event) => {
              event.stopPropagation();
              void onMovePoint(route.id, point.id, 1);
            }}
            type="button"
          >
            ↓
          </button>
        </div>
      ),
      align: "center",
      width: "120px",
    },
  ];

  return (
    <CompactTable
      className="route-points-compact-table"
      columns={columns}
      emptyText="В маршруте нет контрольных точек"
      getRowClassName={(point) => selectedPointId === point.id ? "selected" : ""}
      getRowKey={(point) => point.id}
      onRowClick={(point) => onSelectPoint(point.id)}
      rows={points}
    />
  );
}
