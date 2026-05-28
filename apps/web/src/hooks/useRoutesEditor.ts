import { useEffect, useState, type FormEvent } from "react";
import { emptyPointDraft, pointToDraft } from "../components/routes/PointEditorForm";
import { emptyRouteDraft, routeToDraft } from "../components/routes/RouteEditorForm";
import type { RouteDirectoryItem, RouteFormPayload, RoutePointFormPayload } from "../types";

type MaybePromise<T> = T | Promise<T>;

interface UseRoutesEditorParams {
  canManage?: boolean;
  routeCreateIntent: number;
  routeDirectory: RouteDirectoryItem[];
  selectedPointId: string;
  selectedRouteId: string;
  onCreateRoute: (payload: RouteFormPayload) => MaybePromise<string>;
  onCreateRouteWithPoints: (routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) => MaybePromise<string>;
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
  canManage = true,
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
}: UseRoutesEditorParams) {
  const [routeEditorMode, setRouteEditorMode] = useState<"create" | "edit" | null>(null);
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
      if (!canManage) {
        onNotify("Недостаточно прав для управления маршрутами.");
        return;
      }

      startRouteCreate();
    }
  }, [canManage, routeCreateIntent]);

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

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

  async function submitRouteWithPoints(routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!routePayload.name.trim()) {
      onNotify("Укажите название маршрута");
      return;
    }

    const invalidPointIndex = pointPayloads.findIndex((point) => !point.name.trim());
    if (invalidPointIndex >= 0) {
      onNotify(`Укажите название точки №${invalidPointIndex + 1}`);
      return;
    }

    const routeId = await onCreateRouteWithPoints(routePayload, pointPayloads);
    if (!routeId) return;

    onSelectRoute(routeId);
    setRouteEditorMode(null);
    setPointEditorMode("edit");
    onNotify(
      pointPayloads.length
        ? `Маршрут создан, добавлено точек: ${pointPayloads.length}`
        : "Маршрут создан без точек",
    );
  }

  async function submitPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

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
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    setRouteDraft(emptyRouteDraft);
    setRouteEditorMode("create");
  }

  function startPointCreate() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    setPointDraft({
      ...emptyPointDraft,
      zone: selectedRoute?.territory ?? "",
      tag: "",
    });
    setPointEditorMode("create");
  }

  async function deleteSelectedRoute() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!selectedRoute) return;
    await onDeleteRoute(selectedRoute.id);
    setRouteEditorMode(routeDirectory.length <= 1 ? "create" : null);
  }

  async function deleteSelectedPoint() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!selectedRoute || !selectedPoint) return;
    await onDeleteRoutePoint(selectedRoute.id, selectedPoint.id);
    setPointEditorMode("edit");
  }

  function selectPointForEdit(pointId: string) {
    onSelectPoint(pointId);
    setPointEditorMode("edit");
  }

  function cancelRouteEdit() {
    setRouteEditorMode(null);
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
      startRouteEdit: () => {
        if (!canManage) {
          onNotify("Недостаточно прав для управления маршрутами.");
          return;
        }

        setRouteEditorMode("edit");
      },
      submitPoint,
      submitRoute,
      submitRouteWithPoints,
    },
  };
}
