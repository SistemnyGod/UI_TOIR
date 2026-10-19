import { AppState } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getReportDeliveryStates } from "@/db/repositories/outboxReadRepository";
import { completeAssignmentLocally, getReportReadiness } from "@/db/repositories/patrolRepository";
import {
  computeAssignmentReportFingerprint,
  deleteAutoSubmitTimer,
  finishAutoSubmittedReport,
  getAutoSubmitTimer,
  hasCompletionReport,
  listAutoSubmitCandidateAssignmentIds,
  listAutoSubmittedReports,
  listUndeliveredReports,
  markReportAutoSubmitted,
  saveAutoSubmitTimer,
  type AutoSubmittedReport,
  type StoredAutoSubmitTimer
} from "@/db/repositories/reportAutoSubmitRepository";
import {
  autoSubmitReminderLeadMs,
  defaultAutoSubmitDelayMs,
  evaluateAutoSubmit,
  reminderDelayMs,
  type AutoSubmitTimer
} from "@/domain/reporting/autoSubmitPolicy";
import type { ReportDeliveryState } from "@/domain/reporting/reportDeliveryState";
import { decideReportNotices, type ReportNotice, type ReportNoticeKind, type UndeliveredReport } from "@/domain/reporting/reportNoticePolicy";
import { hasActiveFormNavigationGuard } from "@/services/formNavigationGuard";
import { logMobileError } from "@/services/mobileErrorReporter";
import {
  cancelAutoSubmitReminder,
  notifyReportAutoSent,
  presentReportNotice,
  readSentReportNotices,
  saveSentReportNotices,
  scheduleAutoSubmitReminder
} from "@/services/reportDeliveryNotifications";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

export type AutoSubmitPass = {
  submitted: string[];
  armed: { assignmentId: string; remainingMs: number }[];
};

export type AutoSubmitDependencies = {
  getOwnerUserId: () => Promise<string | null>;
  listCandidates: (ownerUserId: string) => Promise<string[]>;
  getReadiness: (assignmentId: string) => Promise<{ ready: boolean; routeName: string | null }>;
  hasCompletionReport: (ownerUserId: string, assignmentId: string) => Promise<boolean>;
  fingerprint: (ownerUserId: string, assignmentId: string) => Promise<string>;
  getTimer: (ownerUserId: string, assignmentId: string) => Promise<StoredAutoSubmitTimer | null>;
  saveTimer: (ownerUserId: string, timer: AutoSubmitTimer, armed: boolean) => Promise<void>;
  deleteTimer: (ownerUserId: string, assignmentId: string) => Promise<void>;
  submit: (assignmentId: string) => Promise<{ clientOperationId: string; alreadyQueued: boolean }>;
  markSubmitted: (ownerUserId: string, assignmentId: string, clientOperationId: string) => Promise<void>;
  requestDelivery: () => void;
  scheduleReminder: (assignmentId: string, routeName: string | null, inMs: number, minutesLeft: number) => Promise<void>;
  cancelReminder: (assignmentId: string) => Promise<void>;
  isEditing: () => boolean;
  wallNow: () => number;
  /** Monotonic milliseconds within this process, or null when unavailable. */
  monotonicNow: () => number | null;
  delayMs: () => number;
  logError: (event: string, error: unknown) => void;
};

const emptyPass = (): AutoSubmitPass => ({ submitted: [], armed: [] });

/**
 * Evaluates every candidate patrol and keeps the durable timers in step.
 * Passes are serialized: a timer tick, a sync event and the background task
 * can never interleave and double-submit or lose a checkpoint.
 */
export function createReportAutoSubmitController(dependencies: AutoSubmitDependencies) {
  const monotonicCheckpoints = new Map<string, number>();
  let tail: Promise<unknown> = Promise.resolve();

  const evaluateOne = async (ownerUserId: string, assignmentId: string, pass: AutoSubmitPass) => {
    const key = `${ownerUserId}\u0000${assignmentId}`;
    const stored = await dependencies.getTimer(ownerUserId, assignmentId);
    if (stored?.status === "submitted") return;

    const [readiness, reported] = await Promise.all([
      dependencies.getReadiness(assignmentId),
      dependencies.hasCompletionReport(ownerUserId, assignmentId)
    ]);
    const ready = readiness.ready && !reported;
    const fingerprint = ready ? await dependencies.fingerprint(ownerUserId, assignmentId) : "";
    const monotonicNow = dependencies.monotonicNow();
    const previousMonotonic = monotonicCheckpoints.get(key);
    const decision = evaluateAutoSubmit(stored, {
      assignmentId,
      ready,
      fingerprint,
      nowWallMs: dependencies.wallNow(),
      monotonicDeltaMs: monotonicNow !== null && previousMonotonic !== undefined ? monotonicNow - previousMonotonic : null,
      editing: dependencies.isEditing()
    }, dependencies.delayMs());

    if (decision.action === "disarm") {
      monotonicCheckpoints.delete(key);
      if (stored) {
        await dependencies.deleteTimer(ownerUserId, assignmentId);
        await dependencies.cancelReminder(assignmentId);
      }
      return;
    }

    if (decision.action === "wait") {
      await dependencies.saveTimer(ownerUserId, decision.timer, decision.armed);
      if (monotonicNow !== null) monotonicCheckpoints.set(key, monotonicNow);
      else monotonicCheckpoints.delete(key);
      if (decision.armed) {
        // Armed or restarted by an edit: (re)place the OS reminder so it still
        // fires when the app is closed.
        const minutesLeft = Math.max(1, Math.ceil(Math.min(autoSubmitReminderLeadMs, decision.remainingMs) / 60_000));
        await dependencies.scheduleReminder(assignmentId, readiness.routeName, reminderDelayMs(decision.remainingMs), minutesLeft)
          .catch((error) => dependencies.logError("report.autosubmit.reminder.failed", error));
      }
      pass.armed.push({ assignmentId, remainingMs: decision.remainingMs });
      return;
    }

    // The exclusive transaction inside completeAssignmentLocally makes this
    // race-safe with a manual tap: one of them creates the report, the other
    // sees alreadyQueued.
    const result = await dependencies.submit(assignmentId);
    monotonicCheckpoints.delete(key);
    await dependencies.cancelReminder(assignmentId);
    if (result.alreadyQueued) {
      await dependencies.deleteTimer(ownerUserId, assignmentId);
      return;
    }
    await dependencies.markSubmitted(ownerUserId, assignmentId, result.clientOperationId);
    pass.submitted.push(assignmentId);
  };

  const runPass = async (): Promise<AutoSubmitPass> => {
    const pass = emptyPass();
    const ownerUserId = await dependencies.getOwnerUserId();
    if (!ownerUserId) return pass;
    const assignmentIds = await dependencies.listCandidates(ownerUserId);
    for (const assignmentId of assignmentIds) {
      try {
        await evaluateOne(ownerUserId, assignmentId, pass);
      } catch (error) {
        dependencies.logError("report.autosubmit.evaluate.failed", error);
      }
    }
    if (pass.submitted.length > 0) dependencies.requestDelivery();
    return pass;
  };

  return {
    evaluate(): Promise<AutoSubmitPass> {
      const run = tail.then(runPass, runPass);
      tail = run.catch(() => undefined);
      return run;
    }
  };
}

function readMonotonicNow(): number | null {
  const now = globalThis.performance?.now?.();
  return typeof now === "number" && Number.isFinite(now) ? now : null;
}

const controller = createReportAutoSubmitController({
  getOwnerUserId: getStoredOwnerUserId,
  listCandidates: listAutoSubmitCandidateAssignmentIds,
  getReadiness: async (assignmentId) => {
    const readiness = await getReportReadiness(assignmentId);
    return {
      ready: readiness.ready && readiness.assignment?.status === "inProgress",
      routeName: readiness.assignment?.routeName ?? null
    };
  },
  hasCompletionReport,
  fingerprint: computeAssignmentReportFingerprint,
  getTimer: getAutoSubmitTimer,
  saveTimer: saveAutoSubmitTimer,
  deleteTimer: deleteAutoSubmitTimer,
  submit: (assignmentId) => completeAssignmentLocally(assignmentId, { submissionMode: "auto" }),
  markSubmitted: markReportAutoSubmitted,
  // Foreground: the mutation scheduler starts a sync. Background task: no
  // requester is registered and the task syncs right after this pass.
  requestDelivery: requestSyncAfterMutation,
  scheduleReminder: scheduleAutoSubmitReminder,
  cancelReminder: cancelAutoSubmitReminder,
  isEditing: () => AppState.currentState === "active" && hasActiveFormNavigationGuard(),
  wallNow: Date.now,
  monotonicNow: readMonotonicNow,
  // The server has no setting for this yet (see docs); the row stores the
  // delay so a server-provided value can replace the default later.
  delayMs: () => defaultAutoSubmitDelayMs,
  logError: (event, error) => { void logMobileError(event, error); }
});

const passListeners = new Set<(pass: AutoSubmitPass) => void>();

/** Screens showing the countdown follow every evaluation pass. */
export function subscribeToAutoSubmitPasses(listener: (pass: AutoSubmitPass) => void) {
  passListeners.add(listener);
  return () => { passListeners.delete(listener); };
}

export async function evaluateReportAutoSubmits() {
  const pass = await controller.evaluate();
  passListeners.forEach((listener) => listener(pass));
  return pass;
}

export type ReportNoticeDependencies = {
  getOwnerUserId: () => Promise<string | null>;
  listUndelivered: (ownerUserId: string) => Promise<{ assignmentId: string; clientOperationId: string; routeName: string | null }[]>;
  getDeliveryStates: (ownerUserId: string, assignmentIds: string[]) => Promise<Map<string, { status: ReportDeliveryState["status"] }>>;
  listAutoSubmitted: (ownerUserId: string) => Promise<AutoSubmittedReport[]>;
  finishAutoSubmitted: (ownerUserId: string, assignmentId: string) => Promise<void>;
  readSent: () => Promise<Record<string, ReportNoticeKind>>;
  saveSent: (sent: Record<string, ReportNoticeKind>) => Promise<void>;
  present: (notice: ReportNotice) => Promise<void>;
  presentAutoSent: (assignmentId: string, routeName: string | null) => Promise<void>;
  isAppActive: () => boolean;
};

export type UndeliveredReportSummary = {
  reports: UndeliveredReport[];
  /** Some report can still go without a person: queued, retrying or waiting for a network. */
  needsDelivery: boolean;
};

const autoDeliverableStates = new Set<ReportDeliveryState["status"]>(["queued", "sending", "waitingNetwork", "retryScheduled"]);

/**
 * Lock-screen notices for reports that are stuck on the phone, and the
 * "sent automatically" confirmation. In the foreground the screens already
 * show the state, so only the confirmation is shown there.
 */
export function createReportNoticeRunner(dependencies: ReportNoticeDependencies) {
  let tail: Promise<unknown> = Promise.resolve();

  const run = async (): Promise<UndeliveredReportSummary> => {
    const ownerUserId = await dependencies.getOwnerUserId();
    if (!ownerUserId) return { reports: [], needsDelivery: false };

    for (const report of await dependencies.listAutoSubmitted(ownerUserId)) {
      if (report.commandStatus === "accepted" || report.commandStatus === "duplicate") {
        await dependencies.presentAutoSent(report.assignmentId, report.routeName);
        await dependencies.finishAutoSubmitted(ownerUserId, report.assignmentId);
      } else if (report.commandStatus === null || ["superseded", "cancelled", "cancelledLocal"].includes(report.commandStatus)) {
        await dependencies.finishAutoSubmitted(ownerUserId, report.assignmentId);
      }
    }

    const undelivered = latestPerAssignment(await dependencies.listUndelivered(ownerUserId));
    const states = await dependencies.getDeliveryStates(ownerUserId, undelivered.map((report) => report.assignmentId));
    const reports: UndeliveredReport[] = undelivered.map((report) => ({
      ...report,
      delivery: states.get(report.assignmentId)?.status ?? "queued"
    }));
    const summary = { reports, needsDelivery: reports.some((report) => autoDeliverableStates.has(report.delivery)) };
    if (dependencies.isAppActive()) return summary;

    const decision = decideReportNotices(reports, await dependencies.readSent());
    for (const notice of decision.notices) {
      await dependencies.present(notice);
    }
    await dependencies.saveSent(decision.sent);
    return summary;
  };

  return {
    run(): Promise<UndeliveredReportSummary> {
      const next = tail.then(run, run);
      tail = next.catch(() => undefined);
      return next;
    }
  };
}

function latestPerAssignment<T extends { assignmentId: string }>(reports: T[]) {
  const seen = new Set<string>();
  return reports.filter((report) => {
    if (seen.has(report.assignmentId)) return false;
    seen.add(report.assignmentId);
    return true;
  });
}

const noticeRunner = createReportNoticeRunner({
  getOwnerUserId: getStoredOwnerUserId,
  listUndelivered: listUndeliveredReports,
  getDeliveryStates: getReportDeliveryStates,
  listAutoSubmitted: listAutoSubmittedReports,
  finishAutoSubmitted: finishAutoSubmittedReport,
  readSent: readSentReportNotices,
  saveSent: saveSentReportNotices,
  present: presentReportNotice,
  presentAutoSent: notifyReportAutoSent,
  isAppActive: () => AppState.currentState === "active"
});

export function runReportDeliveryNotices() {
  return noticeRunner.run();
}
