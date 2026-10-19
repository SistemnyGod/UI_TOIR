import { useMemo, useState } from "react";
import type { RouteDirectoryItem } from "../../../../types";
import { Button, Chip, EmptyState, Panel } from "../../../../shared/ui";

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
      className="route-directory-panel"
      title={`Маршруты · ${routes.filter(route => route.status !== "Архив").length}`}
      note="Выберите маршрут для работы с точками."
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
              aria-pressed={selectedRouteId === route.id}
              aria-label={`Открыть маршрут: ${route.name}`}
              className={`directory-card ${selectedRouteId === route.id ? "active" : ""}`}
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              type="button"
            >
              <strong>{route.name}</strong>
              <span>{route.territory}</span>
              <div className="route-card-meta"><em>{route.points.length} точек · {route.duration || "—"}</em><Chip>{route.status}</Chip></div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title={routes.length ? "Маршруты не найдены" : "Маршрутов нет"}
          description={routes.length ? "Измените поиск или включите отображение архива." : "Создайте первый маршрут, затем добавьте точки и NFC-метки."}
          action={
            <Button disabled={!routes.length && !canManage} onClick={() => routes.length ? (setSearch(""), setShowArchive(true)) : onCreateRoute()} variant="ghost">
              {routes.length ? "Сбросить фильтры" : "Создать маршрут"}
            </Button>
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
