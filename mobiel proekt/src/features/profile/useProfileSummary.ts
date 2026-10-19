import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { getDatabase } from "@/db/database";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getPatrolDeviceContext } from "@/db/repositories/patrolContextRepository";
import { getPatrolOfflineReadiness } from "@/db/repositories/patrolOfflineReadinessRepository";

export function useProfileSummary() {
  const [summary, setSummary] = useState({ pending: 0, files: 0, points: 0, employees: 0, sections: 0, snapshotReady: false, readinessReason: "Маршрут не выбран", dataAt: null as string | null, sentAt: null as string | null });
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  useFocusEffect(useCallback(() => {
    const attempt = reload;
    let mounted = attempt >= 0;
    let reading = false;
    let again = false;
    const read = () => {
      if (reading) { again = true; return; }
      reading = true;
      void (async () => {
      const scope = await captureDataOwnerContext();
      const owner = await getStoredOwnerUserId();
      if (!owner) {
        if (mounted) setSummary({ pending: 0, files: 0, points: 0, employees: 0, sections: 0, snapshotReady: false, readinessReason: "Маршрут не выбран", dataAt: null, sentAt: null });
        return;
      }
      const [db, context] = await Promise.all([getDatabase(), getPatrolDeviceContext()]);
      const [pending, files, readiness, employees, sections, data, sent] = await Promise.all([
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND status NOT IN ('accepted', 'duplicate', 'cancelled', 'superseded')", [owner, currentContourId]),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM files WHERE owner_user_id = ? AND (contour_id = ? OR contour_id IS NULL) AND server_file_id IS NULL", [owner, currentContourId]),
        getPatrolOfflineReadiness(owner, context.assignmentId),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM mobile_employees WHERE owner_user_id = ?", [owner]),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM emu_sections"),
        db.getFirstAsync<{ at: string | null }>("SELECT last_sync_at AS at FROM sync_cursors WHERE scope = ? AND contour_id = ?", [`bootstrap:${currentContourId}`, currentContourId]),
        db.getFirstAsync<{ at: string | null }>("SELECT MAX(updated_at_local) AS at FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND status IN ('accepted', 'duplicate')", [owner, currentContourId])
      ]);
      await assertDataOwnerContext(scope);
      if (mounted) {
        setSummary({ pending: pending?.count ?? 0, files: files?.count ?? 0, points: readiness.pointCount, employees: employees?.count ?? 0, sections: sections?.count ?? 0, snapshotReady: readiness.ready, readinessReason: readiness.reason, dataAt: data?.at ?? null, sentAt: sent?.at ?? null });
        setSummaryError(null);
      }
    })().catch(() => {
      if (mounted) {
        setSummary(prev => ({ ...prev, snapshotReady: false }));
        setSummaryError("Не удалось прочитать локальное состояние. Повторите проверку.");
      }
    }).finally(() => { reading = false; if (mounted && again) { again = false; read(); } });
    };
    read();
    const unsubscribe = subscribeToSyncEvents(() => { if (mounted) read(); });
    return () => { mounted = false; unsubscribe(); };
  }, [reload]));

  return { summary, summaryError, refresh: () => setReload(value => value + 1) };
}
