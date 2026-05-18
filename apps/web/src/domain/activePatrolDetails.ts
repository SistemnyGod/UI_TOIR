import type { ActivePatrol, PatrolCheckpointProgress, PatrolMediaAttachment } from "../types";

export interface ActivePatrolDetail {
  startedAt: string;
  totalTime: string;
  completedPoints: number;
  totalPoints: number;
  lastScanAt: string;
  checkpoints: PatrolCheckpointProgress[];
  media: PatrolMediaAttachment[];
}

export function buildActivePatrolDetail(patrol: ActivePatrol): ActivePatrolDetail {
  const checkpoints = sortCheckpointsByActualTime(
    patrol.checkpoints && patrol.checkpoints.length > 0 ? patrol.checkpoints : buildFallbackCheckpoints(patrol),
  );
  const completedPoints = checkpoints.filter((point) => point.status === "Исправно" || point.status === "Неисправно").length;
  const lastCompletedPoint = [...checkpoints].reverse().find((point) => point.scannedAt || point.activatedAt);
  const lastScanAt = lastCompletedPoint?.scannedAt ?? lastCompletedPoint?.activatedAt ?? "Нет сканов";
  const media = patrol.media && patrol.media.length > 0 ? patrol.media : checkpoints.flatMap((point) => point.media ?? []);

  return {
    startedAt: patrol.startedAt ?? checkpoints[0]?.activatedAt ?? "Не зафиксировано",
    totalTime: patrol.totalTime ?? "Идет обход",
    completedPoints,
    totalPoints: checkpoints.length,
    lastScanAt,
    checkpoints,
    media,
  };
}

export function sortCheckpointsByActualTime(checkpoints: PatrolCheckpointProgress[]) {
  return [...checkpoints].sort((left, right) => getCheckpointTime(left) - getCheckpointTime(right));
}

function getCheckpointTime(point: PatrolCheckpointProgress) {
  const value = point.scannedAt ?? point.activatedAt;

  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function buildFallbackCheckpoints(patrol: ActivePatrol): PatrolCheckpointProgress[] {
  const nextStatus: PatrolCheckpointProgress["status"] = patrol.status === "Задержка" ? "Неисправно" : "Ожидает";
  const routePoints = [
    { name: patrol.currentPoint || "Старт маршрута", status: "Исправно" as const, scannedAt: patrol.startedAt ?? "10:01" },
    { name: "Следующая точка", status: nextStatus, scannedAt: undefined },
  ];

  return routePoints.map((point, index) => ({
    id: `${patrol.id}-point-${index + 1}`,
    activatedAt: point.scannedAt,
    comment:
      index === 0
        ? "Метка активирована, результат ожидает загрузки из мобильного приложения."
        : "Точка будет показана после фактического прохождения обходчиком.",
    media: index === 0 ? [{ id: `${patrol.id}-photo-${index + 1}`, type: "Фото", label: "Фото точки" }] : [],
    name: point.name,
    scannedAt: point.scannedAt,
    status: point.status,
  }));
}
