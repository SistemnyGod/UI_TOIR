import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { buildOperationalPatrolDateRange } from "../domain/patrolQueryWindow";
import type { AssignmentSettingsDto, UpdateAssignmentSettingsDto } from "../api/contracts";
import {
  assignableEmployeesFallback,
  assignableRoutesFallback,
  createApiAssignmentsRepository,
} from "../repositories/assignmentsRepository";
import type {
  ActivePatrol,
  CompleteAssignmentPayload,
  CreateAssignmentPayload,
  DataSourceMode,
  DataSourceStatus,
  Employee,
  RouteOption,
} from "../types";

interface UseAssignmentsWorkspaceOptions {
  dataSourceMode: DataSourceMode;
  refreshPatrolData: () => Promise<void>;
  showToast: (message: string) => void;
}

interface AssignmentCommandResult {
  succeeded: boolean;
  errors?: Record<string, string[]>;
}

export function useAssignmentsWorkspace({
  dataSourceMode,
  refreshPatrolData,
  showToast,
}: UseAssignmentsWorkspaceOptions) {
  const apiAssignments = useMemo(() => createApiAssignmentsRepository(), []);
  const [assignments, setAssignments] = useState<ActivePatrol[]>([]);
  const [listStatus, setListStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState<Employee[]>([]);
  const [assignableRoutes, setAssignableRoutes] = useState<RouteOption[]>([]);
  const [assignmentSettings, setAssignmentSettings] = useState<AssignmentSettingsDto | null>(null);
  const [referenceStatus, setReferenceStatus] = useState<DataSourceStatus>("loading");
  const [referenceErrorMessage, setReferenceErrorMessage] = useState<string | undefined>();

  const refreshReferenceData = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      setReferenceStatus("loading");
      setReferenceErrorMessage(undefined);

      if (dataSourceMode !== "api") {
        setAssignableEmployees(assignableEmployeesFallback as Employee[]);
        setAssignableRoutes(assignableRoutesFallback as RouteOption[]);
        setReferenceStatus("ready");
        return;
      }

      try {
        const [employeesResult, routesResult, settingsResult] = await Promise.allSettled([
          apiAssignments.getEmployees({ signal }),
          apiAssignments.getRoutes({ signal }),
          apiAssignments.getSettings({ signal }),
        ]);
        if (signal?.aborted) return;

        const messages: string[] = [];

        if (employeesResult.status === "fulfilled") {
          setAssignableEmployees(employeesResult.value);
        } else {
          setAssignableEmployees([]);
          messages.push(
            employeesResult.reason instanceof Error
              ? employeesResult.reason.message
              : "Не удалось загрузить сотрудников API",
          );
        }

        if (routesResult.status === "fulfilled") {
          setAssignableRoutes(routesResult.value);
        } else {
          setAssignableRoutes([]);
          messages.push(
            routesResult.reason instanceof Error
              ? routesResult.reason.message
              : "Не удалось загрузить маршруты API",
          );
        }

        if (settingsResult.status === "fulfilled") {
          setAssignmentSettings(settingsResult.value);
        } else {
          messages.push(
            settingsResult.reason instanceof Error
              ? settingsResult.reason.message
              : "Не удалось загрузить настройки назначений API",
          );
        }

        setReferenceStatus(messages.length > 0 ? "error" : "ready");
        setReferenceErrorMessage(messages.join(" "));
        if (messages.length > 0 && dataSourceMode === "api") {
          showToast(`Не все справочники назначений API загружены: ${messages.join(" ")}`);
        }
      } catch (error) {
        if (signal?.aborted) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить сотрудников и маршруты API";
        setAssignableEmployees([]);
        setAssignableRoutes([]);
        setReferenceStatus("error");
        setReferenceErrorMessage(message);
        if (dataSourceMode === "api") {
          showToast(`Не удалось загрузить справочники назначений API: ${message}`);
        }
      }
    },
    [apiAssignments, dataSourceMode, showToast],
  );

  const refreshAssignments = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setAssignments([]);
        setListStatus("idle");
        setErrorMessage(undefined);
        setFieldErrors({});
        return;
      }

      setListStatus("loading");
      setErrorMessage(undefined);

      try {
        const nextAssignments = await apiAssignments.getAssignments(buildOperationalPatrolDateRange(), { signal });
        if (signal?.aborted) return;
        setAssignments(nextAssignments);
        setListStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить назначения API";
        setAssignments([]);
        setListStatus("error");
        setErrorMessage(message);
        showToast(`Не удалось загрузить назначения API: ${message}`);
      }
    },
    [apiAssignments, dataSourceMode, showToast],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshAssignments({ signal: controller.signal });

    return () => controller.abort();
  }, [refreshAssignments]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshReferenceData({ signal: controller.signal });

    return () => controller.abort();
  }, [refreshReferenceData]);

  async function createAssignment(payload: CreateAssignmentPayload) {
    if (dataSourceMode !== "api") {
      const assignment = createLocalAssignment(payload);
      setAssignments((current) => [assignment, ...current.filter((item) => item.id !== assignment.id)]);
      showToast(
        payload.notifyEmployee
          ? "Назначение создано, уведомление отправлено сотруднику"
          : "Назначение создано",
      );
      return;
    }

    setIsCreating(true);
    setFieldErrors({});

    try {
      const assignment = await apiAssignments.createAssignment(payload);
      setAssignments((current) => [assignment, ...current.filter((item) => item.id !== assignment.id)]);
      await refreshPatrolData();
      await refreshAssignments();
      showToast(
        payload.notifyEmployee
          ? "Назначение создано через API, уведомление отправлено сотруднику"
          : "Назначение создано через API",
      );
    } catch (error) {
      handleMutationError(error);
    } finally {
      setIsCreating(false);
    }
  }

  async function runCommand(
    id: string,
    command: "start" | "cancel" | "complete",
    completePayload?: CompleteAssignmentPayload,
  ): Promise<AssignmentCommandResult> {
    if (dataSourceMode !== "api") {
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === id
            ? applyLocalAssignmentCommand(assignment, command, completePayload)
            : assignment,
        ),
      );
      showToast("Назначение обновлено");
      return { succeeded: true };
    }

    setSavingAssignmentId(id);
    setFieldErrors({});

    try {
      const result =
        command === "start"
          ? await apiAssignments.startAssignment(id)
          : command === "cancel"
            ? await apiAssignments.cancelAssignment(id)
            : await apiAssignments.completeAssignment(id, completePayload);

      setAssignments((current) => current.map((item) => (item.id === result.assignment.id ? result.assignment : item)));
      await refreshPatrolData();
      await refreshAssignments();
      showToast(result.message || (result.changed ? "Назначение обновлено" : "Назначение уже в актуальном состоянии"));
      return { succeeded: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        showToast("Назначение не найдено, список обновлен");
        await refreshAssignments();
        return { errors: error.errors, succeeded: false };
      }

      if (error instanceof ApiError && error.status === 409) {
        showToast("Данные устарели, список обновлен");
        await refreshAssignments();
        return { errors: error.errors, succeeded: false };
      }

      handleMutationError(error);
      return {
        errors: error instanceof ApiError ? error.errors : undefined,
        succeeded: false,
      };
    } finally {
      setSavingAssignmentId(undefined);
    }
  }

  async function updateAssignmentSettings(payload: UpdateAssignmentSettingsDto) {
    if (dataSourceMode !== "api") {
      setAssignmentSettings((current) => ({
        favoriteEmployeeIds: payload.favoriteEmployeeIds ?? current?.favoriteEmployeeIds ?? [],
        shiftSettings: payload.shiftSettings ?? current?.shiftSettings ?? {
          dayEnd: "20:00",
          dayStart: "08:00",
          nightEnd: "08:00",
          nightStart: "20:00",
        },
      }));
      return;
    }

    try {
      const next = await apiAssignments.updateSettings(payload);
      setAssignmentSettings(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось сохранить настройки назначений");
    }
  }

  function handleMutationError(error: unknown) {
    if (error instanceof ApiError) {
      setFieldErrors(error.errors ?? {});
      if (error.status === 401 || error.status === 403) {
        showToast("Недостаточно прав для изменения назначения");
        return;
      }

      showToast(error.message || "Не удалось сохранить назначение");
      return;
    }

    showToast(error instanceof Error ? error.message : "Не удалось сохранить назначение");
  }

  return {
    activePatrols: dataSourceMode === "api" ? assignments : assignments.length > 0 ? assignments : undefined,
    assignableEmployees,
    assignableEmployeesFallback: assignableEmployeesFallback as Employee[],
    assignableRoutes,
    assignableRoutesFallback: assignableRoutesFallback as RouteOption[],
    assignmentSettings,
    createAssignment,
    errorMessage,
    fieldErrors,
    isCreating,
    listStatus,
    referenceErrorMessage,
    referenceStatus,
    refreshAssignments,
    refreshReferenceData,
    runCommand,
    savingAssignmentId,
    updateAssignmentSettings,
  };
}

export function applyLocalAssignmentCommand(
  assignment: ActivePatrol,
  command: "start" | "cancel" | "complete",
  completePayload?: CompleteAssignmentPayload,
): ActivePatrol {
  if (command === "start") {
    const startedAtIso = new Date().toISOString();
    return {
      ...assignment,
      currentPoint: "обход выполняется",
      progress: Math.max(assignment.progress, 1),
      startedAt: formatDateTime(startedAtIso),
      startedAtIso,
      status: "В пути",
    };
  }

  if (command === "complete") {
    const finishedAtIso = completePayload?.actualAt ?? new Date().toISOString();
    return {
      ...assignment,
      currentPoint: "обход завершен",
      deviation: "закрыто",
      finishedAt: formatDateTime(finishedAtIso),
      finishedAtIso,
      progress: 100,
      status: "Завершено",
    };
  }

  return {
    ...assignment,
    currentPoint: "назначение отменено",
    progress: 0,
    status: "Отменено",
  };
}

function createLocalAssignment(payload: CreateAssignmentPayload): ActivePatrol {
  const plannedAt = payload.plannedAt ? new Date(payload.plannedAt) : new Date();

  return {
    id: `local-assignment-${crypto.randomUUID()}`,
    patrolRequestId: payload.patrolRequestId,
    employee: payload.employeeName || payload.employeeId || "Сотрудник",
    employeeId: payload.employeeId || "",
    routeId: payload.routeId,
    route: payload.routeName || payload.routeId || "Маршрут",
    zone: "Локальное назначение",
    shift: payload.shift === "Ночь" ? "Ночь" : "День",
    currentPoint: payload.notifyEmployee ? "уведомление отправлено" : "ожидает старта",
    status: payload.notifyEmployee ? "Ожидает" : "Запланирован",
    progress: 0,
    eta: Number.isNaN(plannedAt.getTime())
      ? payload.plannedAt || "-"
      : new Intl.DateTimeFormat("ru-RU", {
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          month: "2-digit",
        }).format(plannedAt),
    deviation: payload.priority === "high" ? "высокий приоритет" : "-",
    plannedAt: Number.isNaN(plannedAt.getTime()) ? payload.plannedAt : formatDateTime(plannedAt.toISOString()),
    plannedAtIso: Number.isNaN(plannedAt.getTime()) ? payload.plannedAt : plannedAt.toISOString(),
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
