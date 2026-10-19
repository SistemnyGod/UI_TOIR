import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { buildOperationalPatrolDateRange } from "../domain/patrolQueryWindow";
import { createClientUuid } from "../shared/clientUuid";
import type { AssignmentSettingsDto, UpdateAssignmentSettingsDto } from "../api/contracts";
import {
  assignableEmployeesFallback,
  assignableRoutesFallback,
  createApiAssignmentsRepository,
} from "../repositories/assignmentsRepository";
import type {
  ActivePatrol,
  CancelAssignmentPayload,
  CompleteAssignmentPayload,
  CreateAssignmentPayload,
  DataSourceMode,
  DataSourceStatus,
  Employee,
  RouteOption,
} from "../types";

interface UseAssignmentsWorkspaceOptions {
  dataSourceMode: DataSourceMode;
  sessionKey?: string;
  refreshPatrolData: () => Promise<void>;
  showToast: (message: string) => void;
}

interface AssignmentCommandResult {
  succeeded: boolean;
  errors?: Record<string, string[]>;
}

export function useAssignmentsWorkspace({
  dataSourceMode,
  sessionKey = "",
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

  const owner = `${dataSourceMode}:${sessionKey}`;
  const ownerRef = useRef({ key: owner, revision: 0 });
  if (ownerRef.current.key !== owner) ownerRef.current = { key: owner, revision: ownerRef.current.revision + 1 };
  const ownerGeneration = ownerRef.current;
  const mounted = useRef(true);
  const [dataOwner, setDataOwner] = useState(owner);
  const isCurrentOwner = useCallback(() => mounted.current && ownerRef.current === ownerGeneration, [ownerGeneration]);
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  const listGeneration = useRef(0), referenceGeneration = useRef(0);
  const listRequest = useRef<{ controller: AbortController; promise: Promise<void>; owner: string } | null>(null);
  const locks = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; listRequest.current?.controller.abort(); listRequest.current = null; };
  }, []);
  useEffect(() => {
    setAssignments([]); setAssignableEmployees([]); setAssignableRoutes([]); setAssignmentSettings(null);
    setErrorMessage(undefined); setReferenceErrorMessage(undefined); setFieldErrors({});
    setIsCreating(false); setSavingAssignmentId(undefined);
    setDataOwner(owner);
  }, [owner]);

  const refreshReferenceData = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (!isCurrentOwner() || signal?.aborted) return;
      const generation = ++referenceGeneration.current;
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
        if (!isCurrentOwner() || signal?.aborted || generation !== referenceGeneration.current) return;

        setDataOwner(owner);
        const messages: string[] = [];

        if (employeesResult.status === "fulfilled") {
          setAssignableEmployees(employeesResult.value);
        } else {
          messages.push(
            employeesResult.reason instanceof Error
              ? employeesResult.reason.message
              : "Не удалось загрузить сотрудников API",
          );
        }

        if (routesResult.status === "fulfilled") {
          setAssignableRoutes(routesResult.value);
        } else {
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
          toastRef.current(`Не все справочники назначений API загружены: ${messages.join(" ")}`);
        }
      } catch (error) {
        if (!isCurrentOwner() || signal?.aborted || generation !== referenceGeneration.current) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить сотрудников и маршруты API";
        setReferenceStatus("error");
        setReferenceErrorMessage(message);
        if (dataSourceMode === "api") {
          toastRef.current(`Не удалось загрузить справочники назначений API: ${message}`);
        }
      }
    },
    [apiAssignments, dataSourceMode, owner, isCurrentOwner],
  );

  const refreshAssignments = useCallback(({ signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {}): Promise<void> => {
    if (!isCurrentOwner() || signal?.aborted) return Promise.resolve();
    if (dataSourceMode !== "api") {
      setDataOwner(owner); setAssignments([]); setListStatus("idle"); setErrorMessage(undefined); setFieldErrors({});
      return Promise.resolve();
    }
    if (silent && listRequest.current?.owner === owner && !listRequest.current.controller.signal.aborted) return listRequest.current.promise;
    listRequest.current?.controller.abort();
    const controller = new AbortController();
    const generation = ++listGeneration.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const current = () => isCurrentOwner() && !controller.signal.aborted && generation === listGeneration.current;
    if (!silent) setListStatus("loading");
    setErrorMessage(undefined);
    const promise = (async () => {
      try {
        const rows = await apiAssignments.getAssignments(buildOperationalPatrolDateRange(), { signal: controller.signal });
        if (current()) { setDataOwner(owner); setAssignments(rows); setListStatus("ready"); }
      } catch (failure) {
        if (!current()) return;
        const message = failure instanceof Error ? failure.message : "Не удалось загрузить назначения";
        setErrorMessage(message); setListStatus("error");
        if (!silent) toastRef.current(message);
      } finally {
        signal?.removeEventListener("abort", abort);
        if (listRequest.current?.controller === controller) listRequest.current = null;
      }
    })();
    listRequest.current = { owner, controller, promise };
    return promise;
  }, [apiAssignments, dataSourceMode, owner, isCurrentOwner]);

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
    const lock = `create:${ownerGeneration.revision}`;
    if (!isCurrentOwner() || locks.current.has(lock)) return { succeeded: false };
    if (dataSourceMode !== "api") {
      const assignment = createLocalAssignment(payload);
      setAssignments((current) => [assignment, ...current.filter((item) => item.id !== assignment.id)]);
      showToast(
        payload.notifyEmployee
          ? "Назначение создано, уведомление отправлено сотруднику"
          : "Назначение создано",
      );
      return { succeeded: true };
    }

    locks.current.add(lock);
    setIsCreating(true);
    setFieldErrors({});

    try {
      const assignment = await apiAssignments.createAssignment(payload);
      if (!isCurrentOwner()) return { succeeded: false };
      setAssignments((current) => [assignment, ...current.filter((item) => item.id !== assignment.id)]);
      await Promise.allSettled([refreshPatrolData(), refreshAssignments()]);
      if (!isCurrentOwner()) return { succeeded: false };
      showToast(
        payload.notifyEmployee
          ? "Назначение создано через API, уведомление отправлено сотруднику"
          : "Назначение создано через API",
      );
      return { succeeded: true };
    } catch (error) {
      if (isCurrentOwner()) handleMutationError(error);
      return { succeeded: false };
    } finally {
      locks.current.delete(lock);
      if (isCurrentOwner()) setIsCreating(false);
    }
  }

  async function runCommand(
    id: string,
    command: "start" | "cancel" | "complete",
    completePayload?: CompleteAssignmentPayload,
    cancelPayload?: CancelAssignmentPayload,
  ): Promise<AssignmentCommandResult> {
    const lock = `command:${ownerGeneration.revision}:${id}`;
    if (!isCurrentOwner() || locks.current.has(lock)) return { succeeded: false };
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

    locks.current.add(lock);
    setSavingAssignmentId(id);
    setFieldErrors({});

    try {
      const result =
        command === "start"
          ? await apiAssignments.startAssignment(id)
          : command === "cancel"
            ? await apiAssignments.cancelAssignment(id, cancelPayload ?? { reasonCode: "legacy_unknown" })
            : await apiAssignments.completeAssignment(id, completePayload);

      if (!isCurrentOwner()) return { succeeded: false };
      setAssignments((current) => current.map((item) => (item.id === result.assignment.id ? result.assignment : item)));
      await Promise.allSettled([refreshPatrolData(), refreshAssignments()]);
      if (!isCurrentOwner()) return { succeeded: false };
      showToast(result.message || (result.changed ? "Назначение обновлено" : "Назначение уже в актуальном состоянии"));
      return { succeeded: true };
    } catch (error) {
      if (!isCurrentOwner()) return { succeeded: false };
      if (error instanceof ApiError && error.status === 404) {
        showToast("Назначение не найдено, список обновлен");
        await refreshAssignments();
        return { errors: { ...error.errors, form: ["Назначение не найдено. Список обновлён; введённые данные сохранены в форме."] }, succeeded: false };
      }

      if (error instanceof ApiError && error.status === 409) {
        showToast("Данные устарели, список обновлен");
        await refreshAssignments();
        return { errors: { ...error.errors, form: ["Назначение изменилось. Проверьте актуальные данные перед повторной отправкой."] }, succeeded: false };
      }

      handleMutationError(error);
      return {
        errors: { ...(error instanceof ApiError ? error.errors : {}), form: [error instanceof Error ? error.message : "Не удалось сохранить назначение. Повторите попытку."] },
        succeeded: false,
      };
    } finally {
      locks.current.delete(lock);
      if (isCurrentOwner()) setSavingAssignmentId(undefined);
    }
  }

  async function updateAssignmentSettings(payload: UpdateAssignmentSettingsDto) {
    if (!isCurrentOwner()) return false;
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
      return true;
    }

    try {
      const next = await apiAssignments.updateSettings(payload);
      if (!isCurrentOwner()) return false;
      setAssignmentSettings(next);
      return true;
    } catch (error) {
      if (isCurrentOwner()) toastRef.current(error instanceof Error ? error.message : "Не удалось сохранить настройки назначений");
      return false;
    }
  }

  function handleMutationError(error: unknown) {
    if (error instanceof ApiError) {
      setFieldErrors({ ...(error.errors ?? {}), form: [error.message || "Не удалось сохранить назначение"] });
      if (error.status === 401 || error.status === 403) {
        showToast("Недостаточно прав для изменения назначения");
        return;
      }

      showToast(error.message || "Не удалось сохранить назначение");
      return;
    }

    setFieldErrors({ form: [error instanceof Error ? error.message : "Не удалось сохранить назначение"] });
    toastRef.current(error instanceof Error ? error.message : "Не удалось сохранить назначение");
  }

  return {
    activePatrols: dataOwner !== owner ? dataSourceMode === "api" ? [] : undefined : dataSourceMode === "api" ? assignments : assignments.length > 0 ? assignments : undefined,
    assignableEmployees: dataOwner === owner ? assignableEmployees : [],
    assignableEmployeesFallback: assignableEmployeesFallback as Employee[],
    assignableRoutes: dataOwner === owner ? assignableRoutes : [],
    assignableRoutesFallback: assignableRoutesFallback as RouteOption[],
    assignmentSettings: dataOwner === owner ? assignmentSettings : null,
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
    id: `local-assignment-${createClientUuid()}`,
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
