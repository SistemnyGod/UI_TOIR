import { useEffect, useState, type FormEvent } from "react";
import { emptyPointDraft, pointToDraft } from "../components/routes/PointEditorForm";
import { emptyRouteDraft, routeToDraft } from "../components/routes/RouteEditorForm";
import type { RouteDirectoryItem, RouteFormPayload, RoutePointFormPayload } from "../types";

type MaybePromise<T> = T | Promise<T>;

interface UseRoutesEditorParams {
  routeCreateIntent: number;
  routeDirectory: RouteDirectoryItem[];
  selectedPointId: string;
  selectedRouteId: string;
  onCreateRoute: (payload: RouteFormPayload) => MaybePromise<string>;
  onCreateRoutePoint: (routeId: string, payload: RoutePointFormPayload) => MaybePromise<string>;
  onDeleteRoute: (routeId: string) => MaybePromise<void>;
  onDeleteRoutePoint: (routeId: string, pointId: string) => MaybePromise<void>;
  onNotify: (message: string) => void;
  onSelectPoint: (id: string) => void;
  onSelectRoute: (id: string) => void;
  onUpdateRoute: (routeId: string, payload: RouteFormPayload) => MaybePromise<void>;
  onUpdateRoutePoint: (routeId: string, pointId: string, payload: RoutePointFormPayload) => MaybePromise<void>;
}

export function useRoutesEditor({
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
}: UseRoutesEditorParams) {
  const [routeEditorMode, setRouteEditorMode] = useState<"create" | "edit" | null>(
    routeDirectory.length === 0 ? "create" : null,
  );
  const [routeDraft, setRouteDraft] = useState<RouteFormPayload>(emptyRouteDraft);
  const [pointEditorMode, setPointEditorMode] = useState<"create" | "edit">("edit");
  const [pointDraft, setPointDraft] = useState<RoutePointFormPayload>(emptyPointDraft);
  const selectedRoute = routeDirectory.find((route) => route.id === selectedRouteId);
  const routePoints = selectedRoute?.points ?? [];
  const selectedPoint = routePoints.find((point) => point.id === selectedPointId);

  useEffect(() => {
    if (selectedRoute && routeEditorMode !== "create") {
      setRouteDraft(routeToDraft(selectedRoute));
    }
  }, [routeEditorMode, selectedRoute]);

  useEffect(() => {
    if (selectedPoint && pointEditorMode === "edit") {
      setPointDraft(pointToDraft(selectedPoint));
    }
  }, [pointEditorMode, selectedPoint]);

  useEffect(() => {
    if (routeCreateIntent > 0) {
      startRouteCreate();
    }
  }, [routeCreateIntent]);

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!routeDraft.name.trim()) {
      onNotify("Укажите название маршрута");
      return;
    }

    if (routeEditorMode === "edit" && selectedRoute) {
      await onUpdateRoute(selectedRoute.id, routeDraft);
      setRouteEditorMode(null);
      return;
    }

    const routeId = await onCreateRoute(routeDraft);
    if (routeId) onSelectRoute(routeId);
    setRouteEditorMode(null);
  }

  async function submitPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoute) return;
    if (!pointDraft.name.trim()) {
      onNotify("Укажите название точки");
      return;
    }

    if (pointEditorMode === "edit" && selectedPoint) {
      await onUpdateRoutePoint(selectedRoute.id, selectedPoint.id, pointDraft);
      return;
    }

    const pointId = await onCreateRoutePoint(selectedRoute.id, pointDraft);
    if (pointId) onSelectPoint(pointId);
    setPointEditorMode("edit");
  }

  function startRouteCreate() {
    setRouteDraft(emptyRouteDraft);
    setRouteEditorMode("create");
  }

  function startPointCreate() {
    setPointDraft({
      ...emptyPointDraft,
      zone: selectedRoute?.territory ?? "",
      tag: routePoints[0]?.tag ?? "",
    });
    setPointEditorMode("create");
  }

  async function deleteSelectedRoute() {
    if (!selectedRoute) return;
    await onDeleteRoute(selectedRoute.id);
    setRouteEditorMode(routeDirectory.length <= 1 ? "create" : null);
  }

  async function deleteSelectedPoint() {
    if (!selectedRoute || !selectedPoint) return;
    await onDeleteRoutePoint(selectedRoute.id, selectedPoint.id);
    setPointEditorMode("edit");
  }

  function selectPointForEdit(pointId: string) {
    onSelectPoint(pointId);
    setPointEditorMode("edit");
  }

  function cancelRouteEdit() {
    setRouteEditorMode(selectedRoute ? null : "create");
  }

  function cancelPointEdit() {
    setPointEditorMode("edit");
  }

  return {
    pointDraft,
    pointEditorMode,
    routeDraft,
    routeEditorMode,
    routePoints,
    selectedPoint,
    selectedRoute,
    actions: {
      cancelPointEdit,
      cancelRouteEdit,
      deleteSelectedPoint,
      deleteSelectedRoute,
      selectPointForEdit,
      setPointDraft,
      setRouteDraft,
      startPointCreate,
      startRouteCreate,
      startRouteEdit: () => setRouteEditorMode("edit"),
      submitPoint,
      submitRoute,
    },
  };
}
