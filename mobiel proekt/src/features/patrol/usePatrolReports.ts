import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  fetchPatrolReportPage, getReportScope, listPatrolReports,
  type PatrolReport, type ReportPagePosition, type ReportScope
} from '@/db/repositories/patrolReportRepository';
import { subscribeToSyncEvents } from '@/sync/syncEvents';

import { retainEqualItems } from '@/sync/retainEqualItems';

import { needsRetainedPage, compareReportRows } from '@/sync/retainedListWindow';

const pageSize = 25;
type LoadMode = 'focus' | 'refresh' | 'more' | 'local';

/** Keeps the cursor for old history separate from refreshing its newer head. */
export function usePatrolReports() {
  const [rows, setRows] = useState<PatrolReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadRef = useRef<(mode: LoadMode) => Promise<void>>(async () => undefined);
  const session = useRef({
    generation: 0, active: false, loading: false, dirty: false, loadToken: 0, limit: pageSize,
    scope: null as ReportScope | null,
    next: { page: 1, cursor: null } as ReportPagePosition,
    remoteHasMore: true,
    hasSnapshot: false,
    knownRemoteIds: new Set<string>(),
    visibleRows: [] as PatrolReport[],
    pendingMode: null as LoadMode | null
  });

  const publishLocal = useCallback(async (scope: ReportScope, state = session.current, token?: number) => {
    const boundary = state.visibleRows.at(-1);
    let snapshot = await listPatrolReports(scope, state.limit);
    while (state.active && token === state.loadToken && snapshot.hasMore &&
      needsRetainedPage(snapshot.rows, state.limit, boundary, compareReportRows)) {
      state.limit += pageSize;
      snapshot = await listPatrolReports(scope, state.limit);
    }
    if (!state.active || (token !== undefined && token !== state.loadToken)) return snapshot;
    state.visibleRows = snapshot.rows;
    state.hasSnapshot = true;
    setRows(previous => retainEqualItems(previous, snapshot.rows, row => row.assignmentId));
    setHasMore(snapshot.hasMore || state.remoteHasMore);
    return snapshot;
  }, []);

  const refreshHead = useCallback(async (scope: ReportScope, state: typeof session.current, token: number) => {
    let position: ReportPagePosition = { page: 1, cursor: null };
    const knownBeforeRefresh = new Set(state.knownRemoteIds);
    const fetchedIds = new Set<string>();
    const hasOlderCursor = state.next.cursor !== null || state.next.page > 1;
    while (true) {
      const page = await fetchPatrolReportPage(scope, position);
      if (!state.active || token !== state.loadToken) return;
      const reachesKnownHistory = page.items.some(item => knownBeforeRefresh.has(item.assignmentId));
      page.items.forEach(item => fetchedIds.add(item.assignmentId));
      position = { page: page.page, cursor: page.cursor };
      // On the first load one page is enough. Later, walk through all new
      // pages to the known boundary so a large burst cannot leave a gap.
      if (!page.hasMore || !knownBeforeRefresh.size || reachesKnownHistory) {
        if (!hasOlderCursor) state.next = position;
        state.remoteHasMore = hasOlderCursor ? true : page.hasMore;
        fetchedIds.forEach(id => state.knownRemoteIds.add(id));
        return;
      }
    }
  }, []);

  const load = useCallback(async (mode: LoadMode) => {
    const state = session.current;
    if (!state.active) return;
    if (state.loading) {
      if (mode === 'local') state.dirty = true;
      else state.pendingMode = mode;
      return;
    }
    state.loading = true;
    const generation = state.generation;
    const token = ++state.loadToken;
    const valid = () => state.active && generation === state.generation;
    if (mode !== 'local') setBusy(mode !== 'focus' || !state.hasSnapshot);
    if (mode === 'refresh' || mode === 'more') setNotice(null);
    try {
      const scope = await getReportScope();
      if (!valid()) return;
      if (scope.ownerUserId !== state.scope?.ownerUserId || scope.contourId !== state.scope?.contourId) {
        state.scope = scope;
        state.limit = pageSize;
        state.next = { page: 1, cursor: null };
        state.remoteHasMore = true;
        state.knownRemoteIds.clear();
        state.visibleRows = [];
        state.hasSnapshot = false;
        setNotice(null);
        if (mode !== 'local') setBusy(true);
        setRows([]);
      }
      const localSnapshot = await publishLocal(scope, state, token);
      if (!valid()) return;
      if (mode === 'local') {
        while (valid() && state.dirty) {
          state.dirty = false;
          await publishLocal(scope, state, token);
        }
        return;
      }
      if (mode === 'more') {
        // Reveal rows already persisted on the device before attempting HTTP.
        // This keeps the journal useful offline and avoids a failed network
        // request hiding cached pages.
        if (localSnapshot.hasMore) {
          state.limit += pageSize;
        } else if (state.remoteHasMore) {
          const page = await fetchPatrolReportPage(scope, state.next);
          if (!valid()) return;
          page.items.forEach(item => state.knownRemoteIds.add(item.assignmentId));
          state.next = { page: page.page, cursor: page.cursor };
          state.remoteHasMore = page.hasMore;
          if (page.items.length) state.limit += pageSize;
        } else {
          const before = await listPatrolReports(scope, state.limit);
          const expanded = await listPatrolReports(scope, state.limit + pageSize);
          if (expanded.rows.length > before.rows.length) state.limit += pageSize;
        }
      } else {
        await refreshHead(scope, state, token);
        if (!valid()) return;
      }
      await publishLocal(scope, state, token);
      if (valid()) setNotice(null);
      while (valid() && state.dirty) {
        state.dirty = false;
        await publishLocal(scope, state, token);
      }
    } catch (error) {
      if (valid()) setNotice(error instanceof Error ? error.message : 'Нет связи. Показаны сохранённые отчёты.');
    } finally {
      if (token === state.loadToken) {
        state.loading = false;
        if (mode !== 'local') setBusy(false);
        if (valid() && (state.pendingMode || state.dirty)) {
          const queued = state.pendingMode ?? 'local';
          state.pendingMode = null;
          state.dirty = false;
          void loadRef.current(queued);
        }
      }
    }
  }, [publishLocal, refreshHead]);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);

  useFocusEffect(useCallback(() => {
    const state = session.current;
    state.active = true;
    state.generation++;
    // A previous request may still be awaiting the network. It is no longer
    // allowed to own the loading lock after this screen becomes visible.
    state.loading = false;
    state.dirty = false;
    state.pendingMode = null;
    void load('focus');
    const unsubscribe = subscribeToSyncEvents(event => {
      if (event.refreshedZones?.includes('reportDelivery') || event.completedAssignmentIds.length ||
          event.deliveryChangedAssignmentIds?.length || event.cancelledAssignmentIds?.length) void load('local');
    });
    return () => { state.active = false; state.generation++; unsubscribe(); };
  }, [load]));

  return { rows, busy, notice, hasMore, refresh: () => void load('refresh'), loadMore: () => void load('more') };
}
