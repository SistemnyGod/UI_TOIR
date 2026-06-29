import { RouteDirectoryPanel } from "./components/routes/RouteDirectoryPanel";
import { RouteCreateModal } from "./components/routes/RouteCreateModal";
import { RouteEditModal } from "./components/routes/RouteEditModal";
import { RoutePointDrawer } from "./components/routes/RoutePointDrawer";
import { RouteWorkspacePanel } from "./components/routes/RouteWorkspacePanel";
import { useRoutesEditor } from "../../hooks/useRoutesEditor";
import { routesFallback } from "../../repositories/routesRepository";
import type { RouteDirectoryItem, RouteFormPayload, RouteMode, RoutePointFormPayload, ScreenId } from "../../types";

type MaybePromise<T> = T | Promise<T>;

export function RoutesScreen({
  canAssign = true,
  canManage = true,
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
  onCreateRouteWithPoints,
  onUpdateRoute,
  onDeleteRoute,
  onCreateRoutePoint,
  onUpdateRoutePoint,
  onDeleteRoutePoint,
  onMoveRoutePoint,
}: {
  canAssign?: boolean;
  canManage?: boolean;
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
  onCreateRouteWithPoints: (routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) => MaybePromise<string>;
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
    pointEditorOpen,
    pointEditorMode,
    routeDraft,
    routeEditorMode,
    routePoints,
    selectedPoint,
    selectedRoute,
  } = useRoutesEditor({
    canManage,
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
    onCreateRouteWithPoints,
    onUpdateRoutePoint,
  });

  return (
    <div className="routes-screen">
      <RouteDirectoryPanel
        canManage={canManage}
        routes={routeDirectory}
        selectedRouteId={selectedRoute?.id ?? ""}
        onCreateRoute={actions.startRouteCreate}
        onSelectRoute={onSelectRoute}
      />

      <RouteWorkspacePanel
        canAssign={canAssign}
        canManage={canManage}
        mode={mode}
        routeDraft={routeDraft}
        routeEditorMode={null}
        routePoints={routePoints}
        selectedPointId={selectedPointId}
        selectedRoute={selectedRoute}
        onCancelRouteEdit={actions.cancelRouteEdit}
        onChangeRouteDraft={actions.setRouteDraft}
        onDeleteRoute={actions.deleteSelectedRoute}
        onModeChange={onModeChange}
        onMovePoint={(routeId, pointId, direction) => {
          if (!canManage) {
            onNotify("Недостаточно прав для управления маршрутами.");
            return;
          }

          return onMoveRoutePoint(routeId, pointId, direction);
        }}
        onNavigate={onNavigate}
        onSelectPoint={actions.selectPointForEdit}
        onStartPointCreate={actions.startPointCreate}
        onStartRouteCreate={actions.startRouteCreate}
        onStartRouteEdit={actions.startRouteEdit}
        onSubmitRoute={actions.submitRoute}
      />

      <RouteCreateModal
        draft={routeDraft}
        isOpen={routeEditorMode === "create"}
        onCancel={actions.cancelRouteEdit}
        onChange={actions.setRouteDraft}
        onSubmit={actions.submitRouteWithPoints}
      />

      <RouteEditModal
        draft={routeDraft}
        isOpen={routeEditorMode === "edit"}
        onCancel={actions.cancelRouteEdit}
        onChange={actions.setRouteDraft}
        onDelete={actions.deleteSelectedRoute}
        onSubmit={actions.submitRoute}
      />

      <RoutePointDrawer
        canManage={canManage}
        draft={pointDraft}
        editorMode={pointEditorMode}
        isOpen={pointEditorOpen}
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
