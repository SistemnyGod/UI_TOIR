import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActiveAssignment,
  AssignmentProgress,
  getActiveAssignmentWithProgress,
  listRequestBoard,
  RequestBoardItem
} from "@/db/repositories/patrolRepository";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { buildPatrolHomeSummary, selectVisiblePatrolRequests } from "./patrolHomeViewModel";

export type PatrolHomeActive = {
  assignment: ActiveAssignment;
  progress: AssignmentProgress;
};

export function usePatrolHomeDashboard() {
  const [active, setActive] = useState<PatrolHomeActive | null>(null);
  const [requests, setRequests] = useState<RequestBoardItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refreshInProgressRef = useRef(false);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof readDashboardSnapshot>>) => {
    setActive(snapshot.active);
    setRequests(snapshot.requests);
  }, []);

  const reloadLocal = useCallback(async () => {
    const snapshot = await readDashboardSnapshot();
    applySnapshot(snapshot);
  }, [applySnapshot]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void readDashboardSnapshot()
        .then((snapshot) => {
          if (isMounted) {
            applySnapshot(snapshot);
          }
        })
        .catch((error) => {
          if (isMounted) {
            setMessage("Не удалось прочитать сохранённые данные обходов.");
          }
          void logMobileError("patrol.dashboard.local-load.failed", error);
        });

      return () => {
        isMounted = false;
      };
    }, [applySnapshot])
  );

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToSyncEvents(() => {
      void readDashboardSnapshot()
        .then((snapshot) => {
          if (isMounted) {
            applySnapshot(snapshot);
          }
        })
        .catch((error) => {
          void logMobileError("patrol.dashboard.sync-refresh.failed", error);
        });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applySnapshot]);

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
      setMessage(updated ? "Заявки обновлены." : "Нет сети. Показаны данные, сохранённые на телефоне.");
    } catch (error) {
      void logMobileError("patrol.dashboard.refresh.failed", error);
      await reloadLocal().catch((reloadError) => {
        void logMobileError("patrol.dashboard.refresh-recovery.failed", reloadError);
      });
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки.");
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
    summary,
    visibleRequests
  };
}

async function readDashboardSnapshot() {
  const [active, requests] = await Promise.all([
    getActiveAssignmentWithProgress(),
    listRequestBoard()
  ]);
  return { active, requests };
}