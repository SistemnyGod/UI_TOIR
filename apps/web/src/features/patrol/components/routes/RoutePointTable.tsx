import type { RouteDirectoryItem, RoutePoint } from "../../../../types";

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
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Точка</th>
            <th>Зона</th>
            <th>Тип</th>
            <th>NFC / тег</th>
            <th>Фото</th>
            <th>Порядок</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              className={`clickable ${selectedPointId === point.id ? "selected" : ""}`}
              key={point.id}
            >
              <td>{point.order}</td>
              <td>
                <button
                  aria-pressed={selectedPointId === point.id}
                  className="route-point-select"
                  onClick={() => onSelectPoint(point.id)}
                  type="button"
                >
                  {point.name}
                </button>
              </td>
              <td>{point.zone || "-"}</td>
              <td>{point.type}</td>
              <td>{point.tag || "-"}</td>
              <td>{point.requiresPhoto ? "Да" : "Нет"}</td>
              <td>
                <div className="order-actions">
                  <button aria-label={`Переместить точку «${point.name}» выше`} className="icon-button mini-icon" disabled={!canManage} onClick={() => onMovePoint(route.id, point.id, -1)} type="button">
                    ↑
                  </button>
                  <button aria-label={`Переместить точку «${point.name}» ниже`} className="icon-button mini-icon" disabled={!canManage} onClick={() => onMovePoint(route.id, point.id, 1)} type="button">
                    ↓
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
