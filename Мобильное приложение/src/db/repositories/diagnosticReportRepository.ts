import * as Crypto from "expo-crypto";

import { getDatabase } from "@/db/database";
import { countPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import {
  diagnosticReportIntervalMs,
  isDailyDiagnosticReportDue,
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

export type MobileDiagnosticReport = {
  reportId: string;
  deviceId: string;
  appVersion: string;
  platform: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  pendingOutboxCount: number;
  entries: MobileDiagnosticEntry[];
};

export type MobileDiagnosticReportRow = {
  reportId: string;
  status: "pending" | "sent";
  periodStart: string;
  periodEnd: string;
  createdAtLocal: string;
  sentAtLocal: string | null;
  lastError: string | null;
  entryCount: number;
};

export async function getOrCreatePendingDiagnosticReport(
  ownerUserId: string,
  device: { deviceId: string; appVersion: string; platform: string },
  now = new Date(),
  options: { force?: boolean; includeEmpty?: boolean } = {}
): Promise<MobileDiagnosticReport | null> {
  const db = await getDatabase();
  const pending = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM mobile_diagnostic_reports WHERE owner_user_id = ? AND status = 'pending' ORDER BY created_at_local LIMIT 1`,
    [ownerUserId]
  );
  if (pending) {
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
        AND (owner_user_id = ? OR owner_user_id IS NULL)
        AND (
          LOWER(event_type) LIKE '%error%'
          OR LOWER(event_type) LIKE '%failed%'
          OR LOWER(event_type) LIKE '%rejected%'
          OR LOWER(event_type) LIKE '%conflict%'
          OR LOWER(event_type) LIKE '%crash%'
        )
      GROUP BY event_type, message
      ORDER BY event_count DESC, last_seen_at DESC
      LIMIT 100
    `,
    [periodStart.toISOString(), now.toISOString(), ownerUserId]
  );

  if (rows.length === 0 && !options.includeEmpty) {
    await advanceDiagnosticPeriod(ownerUserId, now.toISOString());
    return null;
  }

  const report: MobileDiagnosticReport = {
    reportId: Crypto.randomUUID(),
    deviceId: device.deviceId,
    appVersion: device.appVersion,
    platform: device.platform,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    generatedAt: now.toISOString(),
    pendingOutboxCount: await countPendingOutboxCommands(ownerUserId),
    entries: rows.length > 0
      ? rows.map((row) => ({
          eventType: truncateDiagnosticValue(row.event_type, 120),
          message: sanitizeDiagnosticMessage(row.message),
          count: row.event_count,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at
        }))
      : [{
          eventType: "diagnostic.manual",
          message: "Ручной диагностический отчет без критических ошибок за период.",
          count: 1,
          firstSeenAt: now.toISOString(),
          lastSeenAt: now.toISOString()
        }]
  };

  await withSqliteBusyRetry(() =>
    db.runAsync(
      `
        INSERT OR IGNORE INTO mobile_diagnostic_reports (
          report_id, owner_user_id, period_start, period_end, payload_json, status, created_at_local
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `,
      [report.reportId, ownerUserId, report.periodStart, report.periodEnd, JSON.stringify(report), report.generatedAt]
    )
  );

  return report;
}

export async function listDiagnosticReports(limit = 10): Promise<MobileDiagnosticReportRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    report_id: string;
    status: "pending" | "sent";
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
      ORDER BY created_at_local DESC
      LIMIT ?
    `,
    [limit]
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
  const sentAt = new Date().toISOString();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<{ owner_user_id: string }>(
        "SELECT owner_user_id FROM mobile_diagnostic_reports WHERE report_id = ?",
        [report.reportId]
      );
      if (!row) {
        return;
      }

      await tx.runAsync(
        "UPDATE mobile_diagnostic_reports SET status = 'sent', sent_at_local = ?, last_error = NULL WHERE report_id = ?",
        [sentAt, report.reportId]
      );
      await tx.runAsync(
        `INSERT INTO mobile_diagnostic_state (owner_user_id, last_period_end) VALUES (?, ?)
         ON CONFLICT(owner_user_id) DO UPDATE SET last_period_end = excluded.last_period_end`,
        [row.owner_user_id, report.periodEnd]
      );
      await tx.runAsync(
        "DELETE FROM mobile_diagnostic_reports WHERE status = 'sent' AND sent_at_local < ?",
        [new Date(Date.now() - 30 * diagnosticReportIntervalMs).toISOString()]
      );
    })
  );
}

export async function markDiagnosticReportFailed(reportId: string, error: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.runAsync(
      "UPDATE mobile_diagnostic_reports SET last_error = ? WHERE report_id = ? AND status = 'pending'",
      [sanitizeDiagnosticMessage(error), reportId]
    )
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
