import type { RouteDirectoryItem, RoutePoint } from "../../types";
import { Chip } from "../ui";

type MaybePromise<T> = T | Promise<T>;

export function RoutePointTable({
  points,
  route,
  selectedPointId,
  onMovePoint,
  onSelectPoint,
}: {
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
            <th>Интервал</th>
            <th>Ожид. время</th>
            <th>Статус</th>
            <th>Порядок</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              className={`clickable ${selectedPointId === point.id ? "selected" : ""}`}
              key={point.id}
              onClick={() => onSelectPoint(point.id)}
            >
              <td>{point.order}</td>
              <td>
                <strong>{point.name}</strong>
              </td>
              <td>{point.zone}</td>
              <td>{point.type}</td>
              <td>{point.tag}</td>
              <td>{point.interval}</td>
              <td>{point.expectedTime}</td>
              <td>
                <Chip>{point.status}</Chip>
              </td>
              <td>
                <div className="order-actions" onClick={(event) => event.stopPropagation()}>
                  <button className="icon-button mini-icon" onClick={() => onMovePoint(route.id, point.id, -1)} type="button">
                    ↑
                  </button>
                  <button className="icon-button mini-icon" onClick={() => onMovePoint(route.id, point.id, 1)} type="button">
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
