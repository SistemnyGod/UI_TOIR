import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { listShiftRemarksPage, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { getWorkListVisibleLimit, listEmuSections, listLocalWorkItemsPage, listMobileEmployees, setWorkListVisibleLimit } from "@/db/repositories/workTaskRepository";
import type { LocalWorkItemsFilter } from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto } from "@/domain/emu/emuTypes";
import { listScope, REFRESH_FAILED_MESSAGE, type TaskFilter, type WorkStatusSetters, type WorkTab } from "@/features/emuTask/workAccountingModel";
import { logMobileError } from "@/services/mobileErrorReporter";
import { loadMoreWorkItems, loadWorkItemsOfflineFirst } from "@/services/workTaskService";
import { compareRemarkRows, compareWorkRows, needsRetainedPage } from "@/sync/retainedListWindow";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { subscribeToSyncEvents } from "@/sync/syncEvents";

/**
 * Local-first works and remarks lists with paging. A reload re-reads as many
 * rows as are already visible so the user keeps their scroll window; reloads
 * requested while a page is loading are deferred until it finishes.
 */
export function useWorkList({ tab, taskFilter, setLoading, setMessage }: { tab: WorkTab; taskFilter: TaskFilter } & WorkStatusSetters) {
  const [tasks, setTasks] = useState<WorkItemDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [taskHasMore, setTaskHasMore] = useState(true);
  const [remarkHasMore, setRemarkHasMore] = useState(true);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [sections, setSections] = useState<MobileEmuSectionDto[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const listContextRef = useRef<string | null>(null);
  const taskCursorRef = useRef<string | null>(null);
  const remarkCursorRef = useRef<string | null>(null);
  const tasksRef = useRef<WorkItemDto[]>([]);
  const remarksRef = useRef<ShiftRemark[]>([]);
  const listGenerationRef = useRef(0);
  const listFocusedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const hasLoadedListRef = useRef(false);
  const localReloadRef = useRef<object | null>(null);
  const reloadLocalRef = useRef<(reset?: boolean) => Promise<void>>(async () => undefined);
  const drainReload = useCallback(() => {
    if (!listFocusedRef.current || !pendingReloadRef.current) return;
    pendingReloadRef.current = false;
    void reloadLocalRef.current().catch(error => {
      if (listFocusedRef.current) setRefreshError(REFRESH_FAILED_MESSAGE);
      void logMobileError("emu.work-accounting.deferred-refresh.failed", error);
    });
  }, []);

  const reloadLocal = useCallback(async (reset = false) => {
    if (!listFocusedRef.current) return;
    if (!reset && (loadingMoreRef.current || localReloadRef.current)) {
      pendingReloadRef.current = true;
      return;
    }
    const operation = {};
    localReloadRef.current = operation;
    try {
      const generation = ++listGenerationRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      const ownerContext = await captureDataOwnerContext();
      const contextKey = `${ownerContext.ownerUserId}:${ownerContext.contourId}:${taskFilter}:account`;
      const contextChanged = listContextRef.current !== contextKey;
      const shouldReset = reset || contextChanged;
      if (!listFocusedRef.current || generation !== listGenerationRef.current) return;
      if (shouldReset) {
        taskCursorRef.current = null;
        remarkCursorRef.current = null;
        listContextRef.current = contextKey;
      }
      const taskListScope = listScope("tasks", contextKey);
      const remarkListScope = listScope("remarks", contextKey);
      const [storedTaskLimit, storedRemarkLimit] = shouldReset
        ? await Promise.all([getWorkListVisibleLimit(taskListScope), getWorkListVisibleLimit(remarkListScope)])
        : [tasksRef.current.length, remarksRef.current.length];
      const targetTaskCount = shouldReset ? storedTaskLimit : tasksRef.current.length;
      const targetRemarkCount = shouldReset ? storedRemarkLimit : remarksRef.current.length;
      const taskBoundary = shouldReset ? undefined : tasksRef.current.at(-1);
      const remarkBoundary = shouldReset ? undefined : remarksRef.current.at(-1);
      const localFilter: LocalWorkItemsFilter = taskFilter;
      const localEmployeeId = null;
      let taskPage = await listLocalWorkItemsPage(25, null, localFilter, localEmployeeId);
      await assertDataOwnerContext(ownerContext);
      const loadedTasks = [...taskPage.items];
      while (needsRetainedPage(loadedTasks, targetTaskCount, taskBoundary, compareWorkRows) && taskPage.nextCursor) {
        taskPage = await listLocalWorkItemsPage(25, taskPage.nextCursor, localFilter, localEmployeeId);
        await assertDataOwnerContext(ownerContext);
        loadedTasks.push(...taskPage.items);
      }
      let remarkPage = await listShiftRemarksPage(25, null);
      await assertDataOwnerContext(ownerContext);
      const loadedRemarks = [...remarkPage.items];
      while (needsRetainedPage(loadedRemarks, targetRemarkCount, remarkBoundary, compareRemarkRows) && remarkPage.nextCursor) {
        remarkPage = await listShiftRemarksPage(25, remarkPage.nextCursor);
        await assertDataOwnerContext(ownerContext);
        loadedRemarks.push(...remarkPage.items);
      }
      const [nextEmployees, nextSections] = await Promise.all([
        listMobileEmployees(),
        listEmuSections()
      ]);
      await assertDataOwnerContext(ownerContext);
      if (!listFocusedRef.current || generation !== listGenerationRef.current) return;
      hasLoadedListRef.current = true;
      tasksRef.current = loadedTasks;
      remarksRef.current = loadedRemarks;
      setTasks(previous => retainEqualItems(previous, loadedTasks, item => item.itemId));
      setRemarks(previous => retainEqualItems(previous, loadedRemarks, item => item.remarkId));
      taskCursorRef.current = taskPage.nextCursor;
      remarkCursorRef.current = remarkPage.nextCursor;
      // A local page can end while the server still has an older page. Keep the
      // continuation action available until that server boundary is checked.
      setTaskHasMore(Boolean(taskPage.nextCursor) || loadedTasks.length === targetTaskCount);
      setRemarkHasMore(Boolean(remarkPage.nextCursor));
      await Promise.all([
        setWorkListVisibleLimit(taskListScope, loadedTasks.length),
        setWorkListVisibleLimit(remarkListScope, loadedRemarks.length)
      ]);
      await assertDataOwnerContext(ownerContext);
      if (generation !== listGenerationRef.current) return;
      setEmployees(previous => retainEqualItems(previous, nextEmployees, item => item.employeeId));
      setSections(previous => retainEqualItems(previous, nextSections, item => item.sectionId));
      setRefreshError(null);
    } finally {
      if (localReloadRef.current === operation) {
        localReloadRef.current = null;
        drainReload();
      }
    }
  }, [drainReload, taskFilter]);
  useEffect(() => { reloadLocalRef.current = reloadLocal; }, [reloadLocal]);

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    if (!event.snapshotRefreshed && !event.refreshedZones?.includes("workItems")) {
      return;
    }

    void reloadLocal()
      .catch((error) => {
        void logMobileError("emu.work-accounting.sync-refresh.failed", error);
        setRefreshError(REFRESH_FAILED_MESSAGE);
      });
  }), [reloadLocal]));
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      listFocusedRef.current = true;
      setLoadingMore(false);
      setLoading(!hasLoadedListRef.current);

      const handleRefreshSuccess = async () => {
        if (!isMounted) return;
        await reloadLocal();
        if (isMounted) {
          setRefreshError(null);
        }
      };
      const handleRefreshFailure = () => {
        if (isMounted) {
          setRefreshError(REFRESH_FAILED_MESSAGE);
        }
      };

      void loadWorkItemsOfflineFirst(handleRefreshSuccess, handleRefreshFailure, null, taskFilter)
        .then(() => { if (isMounted) return reloadLocal(); })
        .then(() => {
          if (isMounted) setMessage(null);
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
        listFocusedRef.current = false;
        listGenerationRef.current++;
        loadingMoreRef.current = false;
        pendingReloadRef.current = false;
      };
    }, [reloadLocal, taskFilter, setLoading, setMessage])
  );

  async function loadMoreRemarks(generation: number) {
    setLoadingMore(true);
    try {
      const page = await listShiftRemarksPage(25, remarkCursorRef.current);
      if (generation !== listGenerationRef.current) return;
      const existingIds = new Set(remarksRef.current.map(item => item.remarkId));
      const additions = page.items.filter(item => !existingIds.has(item.remarkId));
      remarksRef.current = [...remarksRef.current, ...additions];
      setRemarks(remarksRef.current);
      const contextKey = listContextRef.current;
      if (contextKey) void setWorkListVisibleLimit(listScope("remarks", contextKey), remarksRef.current.length);
      remarkCursorRef.current = page.nextCursor;
      setRemarkHasMore(Boolean(page.nextCursor));
    } catch (error) {
      if (generation === listGenerationRef.current) setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующие замечания.");
    } finally {
      if (generation === listGenerationRef.current) { loadingMoreRef.current = false; setLoadingMore(false); drainReload(); }
    }
  }

  async function loadMoreTasks(generation: number) {
    setLoadingMore(true);
    try {
      const scope = taskFilter === "history" ? "history" : "active";
      const employeeId = null;
      const localFilter: LocalWorkItemsFilter = taskFilter;
      // Consume already cached rows first. Offline mode must never wait for
      // the network before exposing a page that is already on the device.
      let page = await listLocalWorkItemsPage(25, taskCursorRef.current, localFilter, employeeId);
      if (generation !== listGenerationRef.current) return;
      let added = page.items;
      let serverNext: string | null = null;
      const knownBefore = new Set(tasksRef.current.map(item => item.itemId));
      const firstPageHasNewRows = added.some(item => !knownBefore.has(item.itemId));
      if (!firstPageHasNewRows && !page.nextCursor) {
        serverNext = await loadMoreWorkItems(scope, employeeId);
        if (generation !== listGenerationRef.current) return;
        const known = new Set(tasksRef.current.map(item => item.itemId));
        const collected: WorkItemDto[] = [];
        let cursor: string | null = null;
        do {
          page = await listLocalWorkItemsPage(25, cursor, localFilter, employeeId);
          if (generation !== listGenerationRef.current) return;
          for (const item of page.items) if (!known.has(item.itemId)) collected.push(item);
          cursor = page.nextCursor;
        } while (collected.length < 25 && cursor);
        added = collected.slice(0, 25);
        // A confirmed end is list state, never a form error or a notification.
      }
      if (added.length > 0) {
        const known = new Set(tasksRef.current.map(item => item.itemId));
        const unique = added.filter(item => !known.has(item.itemId));
        if (unique.length) {
          tasksRef.current = [...tasksRef.current, ...unique];
          setTasks(tasksRef.current);
          const contextKey = listContextRef.current;
          if (contextKey) void setWorkListVisibleLimit(listScope("tasks", contextKey), tasksRef.current.length);
        }
      }
      taskCursorRef.current = page.nextCursor;
      setTaskHasMore(Boolean(page.nextCursor) || added.length > 0 || Boolean(serverNext));
    } catch (error) {
      if (generation === listGenerationRef.current) setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующую страницу работ.");
    } finally {
      if (generation === listGenerationRef.current) { loadingMoreRef.current = false; setLoadingMore(false); drainReload(); }
    }
  }

  async function loadMore() {
    if (!listFocusedRef.current || loadingMoreRef.current || loadingMore || localReloadRef.current) return;
    if (tab === "remarks" && !remarkHasMore) return;
    if (tab === "tasks" && !taskHasMore && !taskCursorRef.current) return;
    loadingMoreRef.current = true;
    const generation = listGenerationRef.current;
    if (tab === "remarks") await loadMoreRemarks(generation);
    else await loadMoreTasks(generation);
  }

  const visibleCount = tab === "tasks" ? tasks.length : remarks.length;
  const hasMore = tab === "tasks" ? taskHasMore : remarkHasMore;

  return {
    tasks, remarks, employees, sections, loadingMore, refreshError,
    /** The «Загрузить ещё» footer is offered only below a non-empty list. */
    showLoadMore: visibleCount > 0 && hasMore,
    reloadLocal, loadMore
  };
}
