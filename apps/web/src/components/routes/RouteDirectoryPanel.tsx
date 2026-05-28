import { useMemo, useState } from "react";
import type { RouteDirectoryItem } from "../../types";
import { EmptyState, Panel } from "../ui";

export function RouteDirectoryPanel({
  canManage = true,
  routes,
  selectedRouteId,
  onCreateRoute,
  onSelectRoute,
}: {
  canManage?: boolean;
  routes: RouteDirectoryItem[];
  selectedRouteId: string;
  onCreateRoute: () => void;
  onSelectRoute: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visibleRoutes = showArchive ? routes : routes.filter((route) => route.status !== "Архив");
    if (!query) return visibleRoutes;

    return visibleRoutes.filter((route) => [route.name, route.territory].some((value) => value.toLowerCase().includes(query)));
  }, [routes, search, showArchive]);

  return (
    <Panel
      title="Маршруты"
      note="Локальный справочник маршрутов и архив"
      actions={
        <button className="button primary compact-button" disabled={!canManage} onClick={onCreateRoute} type="button">
          + Создать
        </button>
      }
    >
      <label className="full-label">
        Поиск маршрутов
        <input
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Название или территория"
          value={search}
        />
      </label>
      {filteredRoutes.length > 0 ? (
        <div className="route-directory-list">
          {filteredRoutes.map((route) => (
            <button
              className={`directory-card ${selectedRouteId === route.id ? "active" : ""}`}
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              type="button"
            >
              <strong>{route.name}</strong>
              <span>{route.territory}</span>
              <em>{route.points.length} точек</em>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Маршрутов нет"
          description="Создайте первый маршрут, затем добавьте точки и NFC-метки."
          action={
            <button className="button ghost" disabled={!canManage} onClick={onCreateRoute} type="button">
              Создать маршрут
            </button>
          }
        />
      )}
      <div className="directory-footer">
        <strong>Всего маршрутов: {routes.length}</strong>
        <button className="link-button" onClick={() => setShowArchive((value) => !value)} type="button">
          {showArchive ? "Скрыть архив" : "Показать архив"}
        </button>
      </div>
    </Panel>
  );
}
