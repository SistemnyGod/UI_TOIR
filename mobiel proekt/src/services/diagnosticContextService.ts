import NetInfo from "@react-native-community/netinfo";

import { probeServerHealthCached } from "@/api/serverHealthApi";
import { currentContourId, defaultEnvironment } from "@/core/environments";
import { getServerBaseUrl } from "@/core/serverSettings";
import { getDatabase } from "@/db/database";
import type { MobileDiagnosticContext } from "@/db/repositories/diagnosticReportRepository";
import { canAttemptServerConnection } from "@/core/networkPolicy";
import { readBackgroundSyncState } from "@/sync/backgroundSyncState";

export async function collectDiagnosticContext(): Promise<MobileDiagnosticContext> {
  const [networkState, backgroundSync, schemaMigrationCount] = await Promise.all([
    NetInfo.fetch().catch(() => null),
    readBackgroundSyncState().catch(() => null),
    readSchemaMigrationCount()
  ]);
  const canProbeHealth = networkState ? canAttemptServerConnection(networkState) : false;
  const health = canProbeHealth
    ? await probeCurrentServerHealth()
    : { status: "notChecked" as const, failureKind: null };

  return {
    environment: defaultEnvironment.name,
    contourId: currentContourId,
    networkConnected: networkState?.isConnected ?? null,
    internetReachable: networkState?.isInternetReachable ?? null,
    healthStatus: health.status,
    healthFailureKind: health.failureKind,
    lastBackgroundAttemptAt: backgroundSync?.lastBackgroundSyncAt || null,
    lastServerContactAt: backgroundSync?.lastServerContactAt ?? null,
    lastCompleteQueueSyncAt: backgroundSync?.lastCompleteQueueSyncAt ?? null,
    lastReportDeliveredAt: backgroundSync?.lastReportDeliveredAt ?? null,
    schemaMigrationCount
  };
}

async function probeCurrentServerHealth() {
  try {
    const serverBaseUrl = await getServerBaseUrl();
    const probe = await probeServerHealthCached(serverBaseUrl);
    return probe.ok
      ? { status: "ok" as const, failureKind: null }
      : { status: "unavailable" as const, failureKind: probe.failureKind ?? "serverUnavailable" };
  } catch {
    return { status: "unavailable" as const, failureKind: "serverUnavailable" };
  }
}

async function readSchemaMigrationCount() {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM schema_migrations");
    return row?.count ?? 0;
  } catch {
    return null;
  }
}