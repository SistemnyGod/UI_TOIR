import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  fetchPatrolReportPage, getReportScope, listPatrolReports,
  type PatrolReport, type ReportPagePosition, type ReportScope
} from '@/db/repositories/patrolReportRepository';
import { subscribeToSyncEvents } from '@/sync/syncEvents';

const pageSize = 25;

/** Keeps the cursor for old history separate from refreshing its newer head. */
export function usePatrolReports() {
  const [rows, setRows] = useState<PatrolReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const session = useRef({
    generation: 0, active: false, loading: false, dirty: false, loadToken: 0, limit: pageSize,
    scope: null as ReportScope | null,
    next: { page: 1, cursor: null } as ReportPagePosition,
    remoteHasMore: true,
    knownRemoteIds: new Set<string>()
  });

  const publishLocal = useCallback(async (scope: ReportScope, state = session.current, token?: number) => {
    const snapshot = await listPatrolReports(scope, state.limit);
    if (!state.active || (token !== undefined && token !== state.loadToken)) return snapshot;
    setRows(snapshot.rows);
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

  const load = useCallback(async (mode: 'refresh' | 'more' | 'local') => {
    const state = session.current;
    if (!state.active) return;
    if (state.loading) { state.dirty = true; return; }
    state.loading = true;
    const generation = state.generation;
    const token = ++state.loadToken;
    const valid = () => state.active && generation === state.generation;
    setBusy(true);
    if (mode !== 'local') setNotice(null);
    try {
      const scope = await getReportScope();
      if (!valid()) return;
      if (scope.ownerUserId !== state.scope?.ownerUserId || scope.contourId !== state.scope?.contourId) {
        state.scope = scope;
        state.limit = pageSize;
        state.next = { page: 1, cursor: null };
        state.remoteHasMore = true;
        state.knownRemoteIds.clear();
        setRows([]);
      }
      const localSnapshot = await publishLocal(scope, state, token);
      if (!valid() || mode === 'local') return;
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
      while (valid() && state.dirty) {
        state.dirty = false;
        await publishLocal(scope, state, token);
      }
    } catch (error) {
      if (valid()) setNotice(error instanceof Error ? error.message : 'Нет связи. Показаны сохранённые отчёты.');
    } finally {
      if (token === state.loadToken) { state.loading = false; setBusy(false); }
    }
  }, [publishLocal, refreshHead]);

  useFocusEffect(useCallback(() => {
    const state = session.current;
    state.active = true;
    state.generation++;
    // A previous request may still be awaiting the network. It is no longer
    // allowed to own the loading lock after this screen becomes visible.
    state.loading = false;
    state.dirty = false;
    void load('refresh');
    const unsubscribe = subscribeToSyncEvents(event => {
      if (event.refreshedZones?.includes('reportDelivery') || event.completedAssignmentIds.length ||
          event.deliveryChangedAssignmentIds?.length || event.cancelledAssignmentIds?.length) void load('local');
    });
    return () => { state.active = false; state.generation++; unsubscribe(); };
  }, [load]));

  return { rows, busy, notice, hasMore, refresh: () => void load('refresh'), loadMore: () => void load('more') };
}
