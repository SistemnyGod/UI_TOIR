import { useMemo, useState, type FormEvent } from "react";
import type { RouteDirectoryItem, RouteFormPayload, RouteMode, RoutePoint, ScreenId } from "../../../../types";
import { Button, Chip, EmptyState, Panel, SectionTabs, PaginationBar, type PageSizeOption } from "../../../../shared/ui";
import { RouteEditorForm } from "./RouteEditorForm";
import { RoutePointTable } from "./RoutePointTable";

type MaybePromise<T> = T | Promise<T>;

interface RouteWorkspacePanelProps {
  canAssign?: boolean;
  canManage?: boolean;
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
  canAssign = true,
  canManage = true,
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
            <Button className="compact-button" disabled={!canManage} onClick={onStartRouteEdit} variant="ghost">
              Редактировать
            </Button>
            <Button className="compact-button" disabled={!canAssign} onClick={() => onNavigate("assign")} variant="ghost">
              Назначить
            </Button>
            <Button className="compact-button" onClick={() => onNavigate("results")} variant="ghost">Результаты обходов</Button>
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
          description="Выберите маршрут слева или создайте новый с контрольными точками."
          action={
            <Button disabled={!canManage} onClick={onStartRouteCreate} variant="primary">
              Создать маршрут
            </Button>
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
              { id: "scheme", label: "Порядок обхода" },
            ]}
          />

          <RouteModeContent
            canManage={canManage}
            mode={mode}
            route={selectedRoute}
            routePoints={routePoints}
            selectedPointId={selectedPointId}
            onMovePoint={onMovePoint}
            onSelectPoint={onSelectPoint}
            onStartPointCreate={onStartPointCreate}
          />

          <details className="route-tag-help"><summary>Правила NFC / QR-меток</summary><p>Код метки уникален внутри маршрута. Общая метка оборудования может встречаться в разных маршрутах. Точки ручного контроля не требуют сканирования.</p></details>
        </>
      )}
    </Panel>
  );
}

function RouteFacts({ route, routePoints }: { route: RouteDirectoryItem; routePoints: RoutePoint[] }) {
  return (
    <div className="route-facts">
      <div><span>Точек в маршруте</span><strong>{routePoints.length}</strong></div>
      <div><span>Без NFC / QR-метки</span><strong>{routePoints.filter((point) => point.type !== "Ручной контроль" && !point.tag.trim()).length}</strong></div>
      <div><span>Длительность</span><strong>{route.duration || "—"}</strong></div>
      <div><span>Статус</span><Chip>{route.status}</Chip></div>
    </div>
  );
}

function RouteModeContent({
  canManage,
  mode,
  route,
  routePoints,
  selectedPointId,
  onMovePoint,
  onSelectPoint,
  onStartPointCreate,
}: {
  canManage: boolean;
  mode: RouteMode;
  route: RouteDirectoryItem;
  routePoints: RoutePoint[];
  selectedPointId: string;
  onMovePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  onSelectPoint: (pointId: string) => void;
  onStartPointCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const orderedPoints = useMemo(() => [...routePoints].sort((a, b) => a.order - b.order), [routePoints]);
  const filtered = useMemo(() => orderedPoints.filter(point => (
    !query.trim() || [point.name, point.zone, point.tag, point.description, point.instruction].join(" ").toLowerCase().includes(query.trim().toLowerCase())
  ) && (type === "all" || (type === "missing" ? point.type !== "Ручной контроль" && !point.tag.trim() : point.type === type))), [orderedPoints, query, type]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  if (mode === "points") {
    return (
      <div className="route-point-section">
        <div className="section-line-title">
          <h3>Точки маршрута</h3>
          <Button className="compact-button" disabled={!canManage} onClick={onStartPointCreate} variant="ghost">
            + Добавить точку
          </Button>
        </div>
        <div className="route-point-filters">
          <label>Поиск точки<input type="search" value={query} placeholder="Название, зона, код метки" onChange={event => { setQuery(event.currentTarget.value); setPage(1); }} /></label>
          <label>Тип контроля<select value={type} onChange={event => { setType(event.currentTarget.value); setPage(1); }}><option value="all">Все точки</option><option>NFC</option><option>QR-код</option><option>Ручной контроль</option><option value="missing">Без NFC / QR-метки</option></select></label>
          {query || type !== "all" ? <Button variant="ghost" onClick={() => { setQuery(""); setType("all"); setPage(1); }}>Сбросить</Button> : null}
        </div>
        {routePoints.length > 0 ? (
          <RoutePointTable
            canManage={canManage}
            points={filtered.slice((safePage - 1) * pageSize, safePage * pageSize)}
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
              <Button disabled={!canManage} onClick={onStartPointCreate} variant="ghost">
                Добавить точку
              </Button>
            }
          />
        )}
        {routePoints.length ? <PaginationBar page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} /> : null}
      </div>
    );
  }

  if (mode === "scheme") {
    return routePoints.length > 0 ? (
      <ol className="route-point-list">
        {orderedPoints.map((point) => (
          <li className={selectedPointId === point.id ? "active" : ""} key={point.id}>
            <span>{point.order}</span>
            <button onClick={() => onSelectPoint(point.id)} type="button">
              <strong>{point.name}</strong><small>{point.zone || "Зона не указана"} · {point.type} · {point.tag || "без метки"}</small>
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <EmptyState title="Схема пока пустая" description="Схема появится после добавления точек маршрута." />
    );
  }

  if (mode === "stats") {
    return <EmptyState title="Результаты доступны в отдельной вкладке" description="Перейдите в «Результаты обходов», чтобы просмотреть выполненные обходы и замечания." />;
  }

  return (
    <EmptyState
      title="История изменений здесь недоступна"
      description="Для управления маршрутом откройте «Точки маршрута» или «Порядок обхода»."
    />
  );
}
