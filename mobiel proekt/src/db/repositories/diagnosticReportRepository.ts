import * as Crypto from "expo-crypto";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { countPendingOutboxCommands, listSyncQueueCommands } from "@/db/repositories/outboxRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import {
  diagnosticReportIntervalMs,
  isDailyDiagnosticReportDue,
  getDiagnosticEventMessage,
  sanitizeDiagnosticMessage,
  truncateDiagnosticValue
} from "@/services/diagnosticReportPolicy";

export type MobileDiagnosticEntry = {
  eventType: string;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type MobileDiagnosticContext = {
  environment: string;
  contourId: string;
  networkConnected: boolean | null;
  internetReachable: boolean | null;
  healthStatus: "ok" | "unavailable" | "notChecked";
  healthFailureKind: string | null;
  lastBackgroundAttemptAt: string | null;
  lastServerContactAt: string | null;
  lastCompleteQueueSyncAt: string | null;
  lastReportDeliveredAt: string | null;
  schemaMigrationCount: number | null;
};

export type MobileDiagnosticReport = {
  reportId: string;
  appVersion: string;
  platform: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  pendingOutboxCount: number;
  entries: MobileDiagnosticEntry[];
  context?: MobileDiagnosticContext;
};

export type MobileDiagnosticReportStatus = "pending" | "sent" | "abandoned";

/** After this many failed sends a report stops being retried. */
export const MAX_DIAGNOSTIC_REPORT_ATTEMPTS = 5;

export type MobileDiagnosticReportRow = {
  reportId: string;
  status: MobileDiagnosticReportStatus;
  periodStart: string;
  periodEnd: string;
  createdAtLocal: string;
  sentAtLocal: string | null;
  lastError: string | null;
  entryCount: number;
};

export async function getOrCreatePendingDiagnosticReport(
  ownerUserId: string,
  device: { appVersion: string; platform: string },
  now = new Date(),
  options: { force?: boolean; includeEmpty?: boolean; context?: MobileDiagnosticContext } = {}
): Promise<MobileDiagnosticReport | null> {
  const currentOwnerUserId = await getStoredOwnerUserId();
  if (!currentOwnerUserId || currentOwnerUserId !== ownerUserId) {
    return null;
  }

  const db = await getDatabase();
  const pending = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM mobile_diagnostic_reports WHERE owner_user_id = ? AND status = 'pending' ORDER BY created_at_local LIMIT 1`,
    [ownerUserId]
  );
  if (pending && !options.force) {
    return JSON.parse(pending.payload_json) as MobileDiagnosticReport;
  }

  const state = await db.getFirstAsync<{ last_period_end: string }>(
    "SELECT last_period_end FROM mobile_diagnostic_state WHERE owner_user_id = ?",
    [ownerUserId]
  );
  const periodStart = state?.last_period_end
    ? new Date(state.last_period_end)
    : new Date(now.getTime() - diagnosticReportIntervalMs);
  if (!options.force && !isDailyDiagnosticReportDue(periodStart, now)) {
    return null;
  }

  const queueCommands = await listSyncQueueCommands(ownerUserId, 100);
  const queueEntries = buildQueueDiagnosticEntries(queueCommands);
  const actionLogLimit = Math.max(1, 100 - queueEntries.length);
  const rows = await db.getAllAsync<{
    event_type: string;
    message: string;
    event_count: number;
    first_seen_at: string;
    last_seen_at: string;
  }>(
    `
      SELECT
        event_type,
        message,
        COUNT(*) AS event_count,
        MIN(created_at_local) AS first_seen_at,
        MAX(created_at_local) AS last_seen_at
      FROM mobile_action_log
      WHERE created_at_local > ?
        AND created_at_local <= ?
        AND owner_user_id = ?
        AND (
          LOWER(event_type) LIKE '%error%'
          OR LOWER(event_type) LIKE '%failed%'
          OR LOWER(event_type) LIKE '%rejected%'
          OR LOWER(event_type) LIKE '%conflict%'
          OR LOWER(event_type) LIKE '%crash%'
          OR LOWER(event_type) LIKE 'auth.refresh.%'
          OR LOWER(event_type) LIKE 'network.%'
          OR LOWER(event_type) LIKE 'sync.%'
          OR LOWER(event_type) LIKE 'mobile.data.refresh.%'
        )
      GROUP BY event_type, message
      ORDER BY event_count DESC, last_seen_at DESC
      LIMIT ?
    `,
    [periodStart.toISOString(), now.toISOString(), ownerUserId, actionLogLimit]
  );

  if (rows.length === 0 && queueEntries.length === 0 && !options.includeEmpty) {
    await advanceDiagnosticPeriod(ownerUserId, now.toISOString());
    return null;
  }

  const actionLogEntries = rows.map((row) => ({
    eventType: truncateDiagnosticValue(row.event_type, 120),
    message: getDiagnosticEventMessage(row.event_type),
    count: row.event_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  }));
  const entries = [...queueEntries, ...actionLogEntries];
  const report: MobileDiagnosticReport = {
    reportId: Crypto.randomUUID(),
    appVersion: device.appVersion,
    platform: device.platform,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    generatedAt: now.toISOString(),
    pendingOutboxCount: await countPendingOutboxCommands(ownerUserId),
    context: options.context,
    entries: entries.length > 0
      ? entries
      : [{
          eventType: "diagnostic.manual",
          message: "Ручной диагностический отчет без критических ошибок за период.",
          count: 1,
          firstSeenAt: now.toISOString(),
          lastSeenAt: now.toISOString()
        }]
  };

  return withSqliteBusyRetry(async () => {
    let existingPayloadJson: string | null = null;
    await withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const existing = await tx.getFirstAsync<{ payload_json: string }>(
        `
          SELECT payload_json
          FROM mobile_diagnostic_reports
          WHERE owner_user_id = ? AND status = 'pending'
          ORDER BY created_at_local ASC
          LIMIT 1
        `,
        [ownerUserId]
      );
      if (existing) {
        if (!options.force) {
          existingPayloadJson = existing.payload_json;
          return;
        }

        const existingReport = JSON.parse(existing.payload_json) as MobileDiagnosticReport;
        const refreshedReport: MobileDiagnosticReport = {
          ...report,
          reportId: existingReport.reportId,
          periodStart: existingReport.periodStart
        };
        existingPayloadJson = JSON.stringify(refreshedReport);
        await tx.runAsync(
          `
            UPDATE mobile_diagnostic_reports
            SET period_end = ?, payload_json = ?, last_error = NULL
            WHERE report_id = ? AND owner_user_id = ? AND status = 'pending'
          `,
          [refreshedReport.periodEnd, existingPayloadJson, existingReport.reportId, ownerUserId]
        );
        return;
      }

      await tx.runAsync(
        `
          INSERT OR IGNORE INTO mobile_diagnostic_reports (
            report_id, owner_user_id, period_start, period_end, payload_json, status, created_at_local
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `,
        [report.reportId, ownerUserId, report.periodStart, report.periodEnd, JSON.stringify(report), report.generatedAt]
      );
    });

    const stored = existingPayloadJson
      ? { payload_json: existingPayloadJson }
      : await db.getFirstAsync<{ payload_json: string }>(
      `
        SELECT payload_json
        FROM mobile_diagnostic_reports
        WHERE owner_user_id = ? AND status = 'pending'
        ORDER BY created_at_local ASC
        LIMIT 1
      `,
      [ownerUserId]
    );

    return stored ? JSON.parse(stored.payload_json) as MobileDiagnosticReport : report;
  });
}

function buildQueueDiagnosticEntries(
  commands: Awaited<ReturnType<typeof listSyncQueueCommands>>
): MobileDiagnosticEntry[] {
  const groups = new Map<string, {
    commandType: string;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    status: string;
  }>();

  for (const command of commands) {
    const key = `${command.status}:${command.commandType}`;
    const seenAt = command.updatedAtLocal ?? command.createdAtLocal;
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      current.firstSeenAt = current.firstSeenAt < command.createdAtLocal
        ? current.firstSeenAt
        : command.createdAtLocal;
      current.lastSeenAt = current.lastSeenAt > seenAt ? current.lastSeenAt : seenAt;
      continue;
    }

    groups.set(key, {
      commandType: command.commandType,
      count: 1,
      firstSeenAt: command.createdAtLocal,
      lastSeenAt: seenAt,
      status: command.status
    });
  }

  return Array.from(groups.values())
    .sort((left, right) => right.count - left.count || right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, 25)
    .map((group) => ({
      eventType: truncateDiagnosticValue(`sync.queue.${group.status}`, 120),
      message: sanitizeDiagnosticMessage(`Команда ${group.commandType} находится в очереди со статусом ${group.status}.`),
      count: group.count,
      firstSeenAt: group.firstSeenAt,
      lastSeenAt: group.lastSeenAt
    }));
}

export async function listDiagnosticReports(limit = 10): Promise<MobileDiagnosticReportRow[]> {
  const db = await getDatabase();
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const rows = await db.getAllAsync<{
    report_id: string;
    status: MobileDiagnosticReportStatus;
    period_start: string;
    period_end: string;
    created_at_local: string;
    sent_at_local: string | null;
    last_error: string | null;
    payload_json: string;
  }>(
    `
      SELECT report_id, status, period_start, period_end, created_at_local, sent_at_local, last_error, payload_json
      FROM mobile_diagnostic_reports
      WHERE owner_user_id = ?
      ORDER BY created_at_local DESC
      LIMIT ?
    `,
    [ownerUserId, limit]
  );

  return rows.map((row) => {
    let entryCount = 0;
    try {
      entryCount = (JSON.parse(row.payload_json) as MobileDiagnosticReport).entries.length;
    } catch {
      entryCount = 0;
    }

    return {
      reportId: row.report_id,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAtLocal: row.created_at_local,
      sentAtLocal: row.sent_at_local,
      lastError: row.last_error,
      entryCount
    };
  });
}

export async function markDiagnosticReportSent(report: MobileDiagnosticReport) {
  const db = await getDatabase();
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  const sentAt = new Date().toISOString();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const row = await tx.getFirstAsync<{ owner_user_id: string }>(
        "SELECT owner_user_id FROM mobile_diagnostic_reports WHERE report_id = ?",
        [report.reportId]
      );
      if (!row || row.owner_user_id !== ownerUserId) {
        return;
      }

      await tx.runAsync(
        "UPDATE mobile_diagnostic_reports SET status = 'sent', sent_at_local = ?, last_error = NULL WHERE owner_user_id = ? AND report_id = ?",
        [sentAt, ownerUserId, report.reportId]
      );
      await tx.runAsync(
        `INSERT INTO mobile_diagnostic_state (owner_user_id, last_period_end) VALUES (?, ?)
         ON CONFLICT(owner_user_id) DO UPDATE SET last_period_end = excluded.last_period_end`,
        [row.owner_user_id, report.periodEnd]
      );
      await tx.runAsync(
        "DELETE FROM mobile_diagnostic_reports WHERE owner_user_id = ? AND status IN ('sent', 'abandoned') AND COALESCE(sent_at_local, created_at_local) < ?",
        [ownerUserId, new Date(Date.now() - 30 * diagnosticReportIntervalMs).toISOString()]
      );
    })
  );
}

/**
 * Record a failed send. A report is abandoned (terminal, never retried) after
 * MAX_DIAGNOSTIC_REPORT_ATTEMPTS failures or when the server rejected it
 * permanently, so one bad report cannot occupy the diagnostic slot forever.
 */
export async function markDiagnosticReportFailed(reportId: string, error: string, options: { permanent?: boolean } = {}) {
  const db = await getDatabase();
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const row = await tx.getFirstAsync<{ attempt_count: number | null; period_end: string }>(
        "SELECT attempt_count, period_end FROM mobile_diagnostic_reports WHERE owner_user_id = ? AND report_id = ? AND status = 'pending'",
        [ownerUserId, reportId]
      );
      if (!row) {
        return;
      }
      const attempts = Number(row.attempt_count ?? 0) + 1;
      const abandon = options.permanent === true || attempts >= MAX_DIAGNOSTIC_REPORT_ATTEMPTS;
      await tx.runAsync(
        "UPDATE mobile_diagnostic_reports SET last_error = ?, attempt_count = ?, status = ? WHERE owner_user_id = ? AND report_id = ? AND status = 'pending'",
        [sanitizeDiagnosticMessage(error), attempts, abandon ? "abandoned" : "pending", ownerUserId, reportId]
      );
      if (abandon) {
        // The next report starts after the abandoned period instead of rebuilding it.
        await tx.runAsync(
          `INSERT INTO mobile_diagnostic_state (owner_user_id, last_period_end) VALUES (?, ?)
           ON CONFLICT(owner_user_id) DO UPDATE SET last_period_end = excluded.last_period_end`,
          [ownerUserId, row.period_end]
        );
      }
    })
  );
}

async function advanceDiagnosticPeriod(ownerUserId: string, periodEnd: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.runAsync(
      `INSERT INTO mobile_diagnostic_state (owner_user_id, last_period_end) VALUES (?, ?)
       ON CONFLICT(owner_user_id) DO UPDATE SET last_period_end = excluded.last_period_end`,
      [ownerUserId, periodEnd]
    )
  );
}

export async function getPendingDiagnosticReport(ownerUserId: string): Promise<MobileDiagnosticReport | null> {
  const currentOwnerUserId = await getStoredOwnerUserId();
  if (!currentOwnerUserId || currentOwnerUserId !== ownerUserId) {
    return null;
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json
     FROM mobile_diagnostic_reports
     WHERE owner_user_id = ? AND status = 'pending'
     ORDER BY created_at_local ASC
     LIMIT 1`,
    [ownerUserId]
  );

  return row ? JSON.parse(row.payload_json) as MobileDiagnosticReport : null;
}
