import { Chip, EmptyState, Panel } from "../../../../shared/ui";
import type { RouteOption, ScreenId } from "../../../../types";

interface AssignableRoutesPanelProps {
  routes: RouteOption[];
  selectedRouteId: string;
  onNavigate: (screen: ScreenId) => void;
  onSelectRoute: (id: string) => void;
}

export function AssignableRoutesPanel({ routes, selectedRouteId, onNavigate, onSelectRoute }: AssignableRoutesPanelProps) {
  return (
    <Panel title="Доступные маршруты" note="Выберите маршрут и время старта" actions={<Chip tone="blue">{routes.length}</Chip>}>
      {routes.length > 0 ? (
        <div className="route-option-list">
          {routes.map((item) => (
            <button
              className={`route-option ${selectedRouteId === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => onSelectRoute(item.id)}
              type="button"
            >
              <span className="radio-dot" />
              <div className="route-main">
                <strong>{item.name}</strong>
                <small>{item.zone}</small>
              </div>
              <Chip>{item.priority}</Chip>
              <div className="route-stats">
                <span><strong>{item.duration}</strong>Длительность</span>
                <span><strong>{item.distance}</strong>Протяженность</span>
                <span><strong>{item.points}</strong>Точек</span>
                <span><strong>{item.loadedEmployees} / {item.requiredEmployees}</strong>Загружено</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Маршрутов для назначения нет"
          description="Маршруты появятся после заполнения справочника маршрутов и точек."
          action={
            <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
              Открыть маршруты
            </button>
          }
        />
      )}
    </Panel>
  );
}
