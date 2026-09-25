import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  ActiveAssignment,
  AssignmentProgress,
  getActiveAssignmentWithProgress,
  getAssignmentScanPolicy,
  getNextPendingAssignmentPoint,
  listRequestBoard,
  RequestBoardItem
} from "@/db/repositories/patrolRepository";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { getPatrolDeviceContext, selectPatrolEmployee } from "@/db/repositories/patrolContextRepository";
import { listMobileEmployees } from "@/db/repositories/workTaskRepository";
import type { MobileEmployeeDto } from "@/domain/emu/emuTypes";
import { buildPatrolHomeSummary, selectVisiblePatrolRequests } from "./patrolHomeViewModel";

export type PatrolHomeActive = {
  assignment: ActiveAssignment;
  progress: AssignmentProgress;
  scanPolicy: {
    nfcEnabled: boolean;
    qrFallbackEnabled: boolean;
  };
  nextPoint: { pointId: string; name: string; description: string | null } | null;
};

export function usePatrolHomeDashboard() {
  const [active, setActive] = useState<PatrolHomeActive | null>(null);
  const [requests, setRequests] = useState<RequestBoardItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const refreshInProgressRef = useRef(false);
  const loadVersion = useRef(0);
  const focused = useRef(false);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof readDashboardSnapshot>>) => {
    setActive(snapshot.active);
    setRequests(snapshot.requests);
    setEmployees(snapshot.employees);
    setSelectedEmployeeId(snapshot.selectedEmployeeId);
    setMessage(snapshot.unavailableMessage);
  }, []);

  const reloadLocal = useCallback(async () => {
    if (!focused.current) return;
    const version = ++loadVersion.current;
    const snapshot = await readDashboardSnapshot();
    if (version === loadVersion.current) applySnapshot(snapshot);
  }, [applySnapshot]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      focused.current = true;

      void reloadLocal()
        .catch((error) => {
          if (isMounted) {
            setMessage("Не удалось прочитать сохранённые данные обходов.");
          }
          void logMobileError("patrol.dashboard.local-load.failed", error);
        });

      const unsubscribe = subscribeToSyncEvents((event) => {
        const touchesDashboard = event.refreshedZones?.some((zone) => zone === "requests" || zone === "activePatrols" || zone === "points") === true
          || event.completedAssignmentIds.length > 0
          || (event.changedAssignmentIds?.length ?? 0) > 0
          || (event.cancelledAssignmentIds?.length ?? 0) > 0;
        if (!touchesDashboard) {
          return;
        }

        void reloadLocal()
          .catch((error) => {
            void logMobileError("patrol.dashboard.sync-refresh.failed", error);
          });
      });

      return () => {
        isMounted = false;
        focused.current = false;
        loadVersion.current++;
        unsubscribe();
      };
    }, [reloadLocal])
  );

  const refresh = useCallback(async () => {
    if (refreshInProgressRef.current) {
      return;
    }

    refreshInProgressRef.current = true;
    setIsRefreshing(true);
    setMessage(null);

    try {
      const updated = await refreshMobileData();
      await reloadLocal();
      if (focused.current && !updated) setMessage("Нет сети. Показаны данные, сохранённые на телефоне.");
    } catch (error) {
      void logMobileError("patrol.dashboard.refresh.failed", error);
      await reloadLocal().catch((reloadError) => {
        void logMobileError("patrol.dashboard.refresh-recovery.failed", reloadError);
      });
      if (focused.current) setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки.");
    } finally {
      refreshInProgressRef.current = false;
      setIsRefreshing(false);
    }
  }, [reloadLocal]);

  const summary = useMemo(() => buildPatrolHomeSummary(requests), [requests]);
  const visibleRequests = useMemo(
    () => selectVisiblePatrolRequests(requests, active?.assignment.requestId ?? null),
    [active?.assignment.requestId, requests]
  );

  return {
    active,
    isRefreshing,
    message,
    refresh,
    employees,
    selectedEmployeeId,
    selectEmployee: async (employeeId: string) => {
      loadVersion.current++;
      setActive(null);
      try {
        if (!employees.some(employee => employee.employeeId === employeeId)) throw new Error("Сотрудник недоступен.");
        await selectPatrolEmployee(employeeId);
        await reloadLocal();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Не удалось сохранить исполнителя.");
      }
    },
    summary,
    visibleRequests
  };
}

async function readDashboardSnapshot() {
  const [context, employees, requests] = await Promise.all([getPatrolDeviceContext(), listMobileEmployees(), listRequestBoard()]);
  const selectedEmployeeId = employees.some((employee) => employee.employeeId === context.employeeId)
    ? context.employeeId
    : !context.employeeId && employees.length === 1 ? employees[0].employeeId : null;
  // A missing selection must never turn into an unfiltered account-wide query.
  // Keep a missing saved assignment visible as unavailable; do not pick another route silently.
  const active = selectedEmployeeId && context.assignmentId
    ? await getActiveAssignmentWithProgress({ employeeId: selectedEmployeeId, assignmentId: context.assignmentId })
    : null;
  const scanPolicy = active
    ? await getAssignmentScanPolicy(active.assignment.assignmentId)
    : null;
  const nextPoint = active ? await getNextPendingAssignmentPoint(active.assignment.assignmentId) : null;
  return {
    active: active && scanPolicy ? { ...active, scanPolicy, nextPoint } : null,
    requests,
    employees,
    selectedEmployeeId,
    unavailableMessage: context.employeeId && !selectedEmployeeId
      ? "Сохранённый исполнитель больше недоступен. Выберите сотрудника."
      : context.assignmentId && !active
        ? "Сохранённый обход завершён или недоступен. Выберите маршрут в разделе «Маршруты»."
        : !selectedEmployeeId && employees.length > 1 ? "Выберите, кто выполняет обход на этом телефоне." : null
  };
}
