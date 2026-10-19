import { useEffect, useRef, useState, type FormEvent } from "react";
import { emptyPointDraft, pointToDraft } from "../features/patrol/components/routes/PointEditorForm";
import { emptyRouteDraft, routeToDraft } from "../features/patrol/components/routes/RouteEditorForm";
import type { RouteDirectoryItem, RouteFormPayload, RoutePoint, RoutePointFormPayload } from "../types";

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
  const [pointEditorOpen, setPointEditorOpen] = useState(false);
  const [pointEditorMode, setPointEditorMode] = useState<"create" | "edit">("edit");
  const [pointDraft, setPointDraft] = useState<RoutePointFormPayload>(emptyPointDraft);
  const [editorRoute, setEditorRoute] = useState<RouteDirectoryItem>();
  const [editorPoint, setEditorPoint] = useState<RoutePoint>();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selectedRoute = routeDirectory.find((route) => route.id === selectedRouteId);
  const routePoints = selectedRoute?.points ?? [];
  const selectedPoint = routePoints.find((point) => point.id === selectedPointId);

  // Drafts and their target IDs are captured when the editor opens. Background
  // refreshes must not replace unsaved input or redirect a save to another point.
  async function mutate(operation: () => MaybePromise<void>, success: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSaving(true);
    setError("");
    try {
      if (!canManage) throw new Error("Недостаточно прав для управления маршрутами.");
      await operation();
      if (alive.current) success();
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : "Не удалось сохранить изменения. Повторите попытку.");
    } finally {
      busyRef.current = false;
      if (alive.current) setIsSaving(false);
    }
  }

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

    if (routeEditorMode === "edit" && editorRoute) {
      await mutate(() => onUpdateRoute(editorRoute.id, routeDraft), () => setRouteEditorMode(null));
      return;
    }
    let routeId = "";
    await mutate(async () => { routeId = await onCreateRoute(routeDraft); }, () => { if (routeId) { onSelectRoute(routeId); setRouteEditorMode(null); } });
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

    let routeId = "";
    await mutate(async () => { routeId = await onCreateRouteWithPoints(routePayload, pointPayloads); }, () => {
      if (!routeId) return;
      onSelectRoute(routeId);
      setRouteEditorMode(null);
      onNotify(pointPayloads.length ? `Маршрут создан, добавлено точек: ${pointPayloads.length}` : "Маршрут создан без точек");
    });
  }

  async function submitPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!editorRoute) return;
    if (!pointDraft.name.trim()) {
      onNotify("Укажите название точки");
      return;
    }

    if (pointEditorMode === "edit" && editorPoint) {
      await mutate(() => onUpdateRoutePoint(editorRoute.id, editorPoint.id, pointDraft), () => setPointEditorOpen(false));
      return;
    }
    let pointId = "";
    await mutate(async () => { pointId = await onCreateRoutePoint(editorRoute.id, pointDraft); }, () => {
      if (!pointId) return;
      onSelectPoint(pointId);
      setPointEditorMode("edit");
      setPointEditorOpen(false);
    });
  }

  function startRouteCreate() {
    if (busyRef.current) return;
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    setError("");
    setEditorRoute(undefined);
    setRouteDraft({ ...emptyRouteDraft });
    setRouteEditorMode("create");
  }

  function startPointCreate() {
    if (busyRef.current) return;
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!selectedRoute) {
      onNotify("Сначала выберите маршрут.");
      return;
    }

    setError("");
    setEditorRoute(selectedRoute);
    setEditorPoint(undefined);
    setPointDraft({
      ...emptyPointDraft,
      zone: selectedRoute?.territory ?? "",
      tag: "",
    });
    setPointEditorMode("create");
    setPointEditorOpen(true);
  }

  async function deleteSelectedRoute() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!editorRoute) return;
    await mutate(() => onDeleteRoute(editorRoute.id), () => setRouteEditorMode(null));
  }

  async function deleteSelectedPoint() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления маршрутами.");
      return;
    }

    if (!editorRoute || !editorPoint) return;
    await mutate(() => onDeleteRoutePoint(editorRoute.id, editorPoint.id), () => setPointEditorOpen(false));
  }

  function selectPointForEdit(pointId: string) {
    if (busyRef.current) return;
    const point = routePoints.find(item => item.id === pointId);
    if (!selectedRoute || !point) return;
    setError("");
    setEditorRoute(selectedRoute);
    setEditorPoint(point);
    setPointDraft(pointToDraft(point));
    onSelectPoint(pointId);
    setPointEditorMode("edit");
    setPointEditorOpen(true);
  }

  function cancelRouteEdit() {
    if (busyRef.current) return;
    setError("");
    setRouteEditorMode(null);
  }

  function cancelPointEdit() {
    if (busyRef.current) return;
    setError("");
    setPointEditorMode("edit");
    setPointEditorOpen(false);
  }

  return {
    editorRoute,
    editorPoint,
    isSaving,
    error,
    pointDraft,
    pointEditorOpen,
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
        if (busyRef.current || !selectedRoute) return;
        if (!canManage) {
          onNotify("Недостаточно прав для управления маршрутами.");
          return;
        }

        setError("");
        setEditorRoute(selectedRoute);
        setRouteDraft(routeToDraft(selectedRoute));
        setRouteEditorMode("edit");
      },
      submitPoint,
      submitRoute,
      submitRouteWithPoints,
    },
  };
}
