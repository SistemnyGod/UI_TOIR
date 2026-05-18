import { RouteDirectoryPanel } from "../components/routes/RouteDirectoryPanel";
import { RoutePointDrawer } from "../components/routes/RoutePointDrawer";
import { RouteWorkspacePanel } from "../components/routes/RouteWorkspacePanel";
import { useRoutesEditor } from "../hooks/useRoutesEditor";
import { routesFallback } from "../repositories/routesRepository";
import type { RouteDirectoryItem, RouteFormPayload, RouteMode, RoutePointFormPayload, ScreenId } from "../types";

type MaybePromise<T> = T | Promise<T>;

export function RoutesScreen({
  selectedRouteId,
  selectedPointId,
  mode,
  onModeChange,
  onNavigate,
  onNotify,
  routeCreateIntent,
  routeDirectory = routesFallback,
  onSelectRoute,
  onSelectPoint,
  onCreateRoute,
  onUpdateRoute,
  onDeleteRoute,
  onCreateRoutePoint,
  onUpdateRoutePoint,
  onDeleteRoutePoint,
  onMoveRoutePoint,
}: {
  selectedRouteId: string;
  selectedPointId: string;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  routeCreateIntent: number;
  routeDirectory?: RouteDirectoryItem[];
  onSelectRoute: (id: string) => void;
  onSelectPoint: (id: string) => void;
  onCreateRoute: (payload: RouteFormPayload) => MaybePromise<string>;
  onUpdateRoute: (routeId: string, payload: RouteFormPayload) => MaybePromise<void>;
  onDeleteRoute: (routeId: string) => MaybePromise<void>;
  onCreateRoutePoint: (routeId: string, payload: RoutePointFormPayload) => MaybePromise<string>;
  onUpdateRoutePoint: (routeId: string, pointId: string, payload: RoutePointFormPayload) => MaybePromise<void>;
  onDeleteRoutePoint: (routeId: string, pointId: string) => MaybePromise<void>;
  onMoveRoutePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
}) {
  const {
    actions,
    pointDraft,
    pointEditorMode,
    routeDraft,
    routeEditorMode,
    routePoints,
    selectedPoint,
    selectedRoute,
  } = useRoutesEditor({
    routeCreateIntent,
    routeDirectory,
    selectedPointId,
    selectedRouteId,
    onCreateRoute,
    onCreateRoutePoint,
    onDeleteRoute,
    onDeleteRoutePoint,
    onNotify,
    onSelectPoint,
    onSelectRoute,
    onUpdateRoute,
    onUpdateRoutePoint,
  });

  return (
    <div className="routes-screen">
      <RouteDirectoryPanel
        routes={routeDirectory}
        selectedRouteId={selectedRoute?.id ?? ""}
        onCreateRoute={actions.startRouteCreate}
        onSelectRoute={onSelectRoute}
      />

      <RouteWorkspacePanel
        mode={mode}
        routeDraft={routeDraft}
        routeEditorMode={routeEditorMode}
        routePoints={routePoints}
        selectedPointId={selectedPointId}
        selectedRoute={selectedRoute}
        onCancelRouteEdit={actions.cancelRouteEdit}
        onChangeRouteDraft={actions.setRouteDraft}
        onDeleteRoute={actions.deleteSelectedRoute}
        onModeChange={onModeChange}
        onMovePoint={onMoveRoutePoint}
        onNavigate={onNavigate}
        onSelectPoint={actions.selectPointForEdit}
        onStartPointCreate={actions.startPointCreate}
        onStartRouteCreate={actions.startRouteCreate}
        onStartRouteEdit={actions.startRouteEdit}
        onSubmitRoute={actions.submitRoute}
      />

      <RoutePointDrawer
        draft={pointDraft}
        editorMode={pointEditorMode}
        point={selectedPoint}
        route={selectedRoute}
        onCancel={actions.cancelPointEdit}
        onChange={actions.setPointDraft}
        onCreate={actions.startPointCreate}
        onDelete={actions.deleteSelectedPoint}
        onSubmit={actions.submitPoint}
      />
    </div>
  );
}
