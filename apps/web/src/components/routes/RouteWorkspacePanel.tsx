import type { FormEvent } from "react";
import type { RouteDirectoryItem, RouteFormPayload, RouteMode, RoutePoint, ScreenId } from "../../types";
import { Chip, EmptyState, Panel, SectionTabs } from "../ui";
import { RouteEditorForm } from "./RouteEditorForm";
import { RoutePointTable } from "./RoutePointTable";

type MaybePromise<T> = T | Promise<T>;

interface RouteWorkspacePanelProps {
  mode: RouteMode;
  routeDraft: RouteFormPayload;
  routeEditorMode: "create" | "edit" | null;
  routePoints: RoutePoint[];
  selectedPointId: string;
  selectedRoute?: RouteDirectoryItem;
  onCancelRouteEdit: () => void;
  onChangeRouteDraft: (draft: RouteFormPayload) => void;
  onDeleteRoute?: () => void;
  onModeChange: (mode: RouteMode) => void;
  onMovePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  onNavigate: (screen: ScreenId) => void;
  onSelectPoint: (pointId: string) => void;
  onStartPointCreate: () => void;
  onStartRouteCreate: () => void;
  onStartRouteEdit: () => void;
  onSubmitRoute: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}

export function RouteWorkspacePanel({
  mode,
  routeDraft,
  routeEditorMode,
  routePoints,
  selectedPointId,
  selectedRoute,
  onCancelRouteEdit,
  onChangeRouteDraft,
  onDeleteRoute,
  onModeChange,
  onMovePoint,
  onNavigate,
  onSelectPoint,
  onStartPointCreate,
  onStartRouteCreate,
  onStartRouteEdit,
  onSubmitRoute,
}: RouteWorkspacePanelProps) {
  return (
    <Panel
      className="route-editor"
      title={selectedRoute ? `Маршрут: ${selectedRoute.name}` : "Маршрут не выбран"}
      note={selectedRoute?.description ?? "Выберите маршрут или создайте новый."}
      actions={
        selectedRoute ? (
          <>
            <Chip>{selectedRoute.status}</Chip>
            <button className="button ghost compact-button" onClick={onStartRouteEdit} type="button">
              Редактировать
            </button>
            <button className="button ghost compact-button" onClick={() => onNavigate("assign")} type="button">
              Назначить
            </button>
          </>
        ) : null
      }
    >
      {routeEditorMode ? (
        <RouteEditorForm
          mode={routeEditorMode}
          draft={routeDraft}
          onCancel={onCancelRouteEdit}
          onChange={onChangeRouteDraft}
          onDelete={routeEditorMode === "edit" ? onDeleteRoute : undefined}
          onSubmit={onSubmitRoute}
        />
      ) : null}

      {!selectedRoute ? (
        <EmptyState
          title="Нет выбранного маршрута"
          description="Редактор точек, схема маршрута и история появятся после создания или выбора маршрута."
          action={
            <button className="button primary" onClick={onStartRouteCreate} type="button">
              Создать маршрут
            </button>
          }
        />
      ) : (
        <>
          <RouteFacts route={selectedRoute} routePoints={routePoints} />
          <SectionTabs
            value={mode}
            onChange={onModeChange}
            tabs={[
              { id: "points", label: "Точки маршрута", count: routePoints.length },
              { id: "scheme", label: "Схема маршрута" },
              { id: "stats", label: "Статистика обходов" },
              { id: "history", label: "История изменений" },
            ]}
          />

          <RouteModeContent
            mode={mode}
            route={selectedRoute}
            routePoints={routePoints}
            selectedPointId={selectedPointId}
            onMovePoint={onMovePoint}
            onSelectPoint={onSelectPoint}
            onStartPointCreate={onStartPointCreate}
          />

          <div className="notice info-soft">
            <strong>Одна и та же NFC-метка может использоваться в разных маршрутах.</strong>
            <span>
              Интерфейс не блокирует повтор метки: это допустимый сценарий для общего оборудования и одинаковых
              контрольных мест.
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

function RouteFacts({ route, routePoints }: { route: RouteDirectoryItem; routePoints: RoutePoint[] }) {
  return (
    <div className="route-facts">
      <div><span>Точек в маршруте</span><strong>{routePoints.length}</strong></div>
      <div><span>NFC-меток</span><strong>{routePoints.filter((point) => point.type === "NFC").length}</strong></div>
      <div><span>Ожидаемое время</span><strong>{route.duration}</strong></div>
      <div><span>Длина маршрута</span><strong>{route.distance}</strong></div>
    </div>
  );
}

function RouteModeContent({
  mode,
  route,
  routePoints,
  selectedPointId,
  onMovePoint,
  onSelectPoint,
  onStartPointCreate,
}: {
  mode: RouteMode;
  route: RouteDirectoryItem;
  routePoints: RoutePoint[];
  selectedPointId: string;
  onMovePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  onSelectPoint: (pointId: string) => void;
  onStartPointCreate: () => void;
}) {
  if (mode === "points") {
    return (
      <div className="route-point-section">
        <div className="section-line-title">
          <h3>Точки маршрута</h3>
          <button className="button ghost compact-button" onClick={onStartPointCreate} type="button">
            + Добавить точку
          </button>
        </div>
        {routePoints.length > 0 ? (
          <RoutePointTable
            points={routePoints}
            route={route}
            selectedPointId={selectedPointId}
            onMovePoint={onMovePoint}
            onSelectPoint={onSelectPoint}
          />
        ) : (
          <EmptyState
            title="Точек в маршруте нет"
            description="Добавьте контрольные точки, порядок обхода и NFC/QR-метки."
            action={
              <button className="button ghost" onClick={onStartPointCreate} type="button">
                Добавить точку
              </button>
            }
          />
        )}
      </div>
    );
  }

  if (mode === "scheme") {
    return routePoints.length > 0 ? (
      <ol className="route-point-list">
        {routePoints.map((point) => (
          <li className={selectedPointId === point.id ? "active" : ""} key={point.id}>
            <span>{point.order}</span>
            <button onClick={() => onSelectPoint(point.id)} type="button">
              {point.name} / {point.zone} / {point.tag}
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <EmptyState title="Схема пока пустая" description="Схема появится после добавления точек маршрута." />
    );
  }

  if (mode === "stats") {
    return <EmptyState title="Статистики обходов нет" description="Показатели появятся после выполнения маршрута." />;
  }

  return (
    <EmptyState
      title="История изменений пуста"
      description="История начнет заполняться после сохранения маршрута и точек."
    />
  );
}
