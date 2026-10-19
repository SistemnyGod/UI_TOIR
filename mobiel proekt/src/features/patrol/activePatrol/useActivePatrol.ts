import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { StaleDataOwnerContextError, assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import {
  ActiveAssignment,
  AssignmentProgress,
  getAssignmentById,
  getAssignmentProgress,
  getAssignmentScanPolicy,
  pauseAssignmentLocally
} from "@/db/repositories/patrolRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { enterPatrolRequest } from "@/services/patrolEntryService";
import { requestPatrolSync } from "@/sync/PatrolSyncCoordinator";
import { reconcileAcceptedCompleteReports } from "@/sync/syncEngine";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { useFocusedOwnerLoad } from "@/sync/useFocusedOwnerLoad";

export type ActivePatrolScanPolicy = { nfcEnabled: boolean; qrFallbackEnabled: boolean };

/**
 * State of one patrol on the active patrol screen: the owner-scoped read of the assignment,
 * its progress and scan policy, reloads on sync events, the delivery check of a locally
 * completed report, and the lifecycle actions (start/resume, pause, retry submit).
 */
export function useActivePatrol(assignmentId: string) {
  const screenActive = useRef(false);
  const [assignment, setAssignment] = useState<ActiveAssignment | null>(null);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [scanPolicy, setScanPolicy] = useState<ActivePatrolScanPolicy>({ nfcEnabled: false, qrFallbackEnabled: false });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const actionInProgressRef = useRef(false);

  const readAssignment = useCallback(async () => {
    const [assignment, progress, scanPolicy] = await Promise.all([
      getAssignmentById(assignmentId), getAssignmentProgress(assignmentId), getAssignmentScanPolicy(assignmentId)
    ]);
    return { assignment, progress, scanPolicy };
  }, [assignmentId]);
  const publishAssignment = useCallback((value: Awaited<ReturnType<typeof readAssignment>>) => {
    setAssignment(value.assignment);
    setProgress(value.assignment ? value.progress : null);
    setScanPolicy(value.scanPolicy);
    setLoadError(null);
  }, []);
  const loadFailed = useCallback((caught: unknown) => {
    if (caught instanceof StaleDataOwnerContextError) {
      setAssignment(null); setProgress(null);
    }
    setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать текущий обход.");
    void logMobileError("patrol.active-load.failed", caught);
  }, []);
  const loadSettled = useCallback(() => setIsLoading(false), []);
  const loadAssignment = useFocusedOwnerLoad(readAssignment, publishAssignment, loadFailed, loadSettled);

  useFocusEffect(useCallback(() => {
    screenActive.current = true;
    requestMobileDataRefresh("appActive");
    return () => { screenActive.current = false; };
  }, []));

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    if (event.snapshotRefreshed === true || event.completedAssignmentIds.includes(assignmentId) || event.cancelledAssignmentIds?.includes(assignmentId)) {
      void loadAssignment().catch((caught) => {
        void logMobileError("patrol.active-sync-load.failed", caught);
        setLoadError(caught instanceof Error ? caught.message : "Не удалось обновить текущий обход.");
      });
    }
  }), [assignmentId, loadAssignment]));

  // A report completed on the phone may already be accepted by the server: check delivery,
  // then always nudge the sync so a pending report keeps moving.
  const completedAssignmentId = assignment?.status === "completedLocal" ? assignment.assignmentId : null;
  useFocusEffect(useCallback(() => {
    let current = true;
    if (completedAssignmentId) {
      void (async () => {
        const scope = await captureDataOwnerContext();
        await reconcileAcceptedCompleteReports(completedAssignmentId);
        await assertDataOwnerContext(scope);
        if (current) await loadAssignment();
      })().catch(caught => {
        void logMobileError("patrol.active-reconcile.failed", caught);
        if (current && !(caught instanceof StaleDataOwnerContextError)) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось проверить доставку отчёта.");
        }
      }).finally(() => { if (current) void requestPatrolSync({ mode: "normal" }); });
    }
    return () => { current = false; };
  }, [completedAssignmentId, loadAssignment]));

  /** Runs one action at a time for the current data owner, then reloads the patrol. */
  async function runAction(action: () => Promise<void>) {
    if (actionInProgressRef.current) {
      return;
    }
    actionInProgressRef.current = true;
    setIsActing(true);
    setError(null);
    try {
      const scope = await captureDataOwnerContext();
      await action();
      await assertDataOwnerContext(scope);
      await loadAssignment();
    } catch (caughtError) {
      if (screenActive.current) setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить действие.");
    } finally {
      actionInProgressRef.current = false;
      if (screenActive.current) setIsActing(false);
    }
  }

  /** Starts or resumes the patrol; `navigate` receives the entry path while the screen is still focused. */
  function startPatrol(current: ActiveAssignment, navigate: (path: string) => void) {
    return runAction(async () => {
      const path = await enterPatrolRequest(current.requestId, current.employeeId ?? undefined, () => screenActive.current);
      if (screenActive.current) navigate(path);
    });
  }

  function retrySubmit() {
    return runAction(async () => {
      await reconcileAcceptedCompleteReports(assignmentId);
      await requestPatrolSync({ mode: "manualReport", assignmentId });
    });
  }

  function pausePatrol() {
    void pauseAssignmentLocally(assignmentId)
      .then(() => loadAssignment())
      .catch((error) => setError(error instanceof Error ? error.message : "Не удалось приостановить обход."));
  }

  return {
    assignment, progress, scanPolicy, isLoading, loadError, error, isActing,
    reload: loadAssignment, startPatrol, retrySubmit, pausePatrol
  };
}
