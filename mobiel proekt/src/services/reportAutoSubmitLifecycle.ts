import { AppState, type AppStateStatus } from "react-native";

import { maybePromptBatteryOptimizationExemption } from "@/services/batteryOptimizationPrompt";
import { logMobileError } from "@/services/mobileErrorReporter";
import { evaluateReportAutoSubmits, runReportDeliveryNotices, type AutoSubmitPass } from "@/services/reportAutoSubmitService";
import { BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES, setBackgroundSyncInterval } from "@/sync/backgroundSyncTask";
import { subscribeToSyncEvents } from "@/sync/syncEvents";

const evaluationDebounceMs = 400;
const timerSlackMs = 250;
const urgentIntervalMinutes = 1;

export type BackgroundSyncCadence = { minutes: number; restart: boolean };

/**
 * How soon the OS should run the background task after the app is left:
 * - a report that can go without a person: one minute (then as soon as a
 *   network is connected, re-run every minute until the app is opened again);
 * - only a running auto-submit countdown: when it ends;
 * - nothing waiting: the normal 15 minutes.
 */
export function resolveBackgroundSyncCadence(pass: AutoSubmitPass, needsDelivery: boolean): BackgroundSyncCadence {
  if (needsDelivery) {
    return { minutes: urgentIntervalMinutes, restart: false };
  }
  const earliestMs = Math.min(...pass.armed.map((timer) => timer.remainingMs));
  if (Number.isFinite(earliestMs)) {
    const minutes = Math.min(Math.max(Math.ceil(earliestMs / 60_000), urgentIntervalMinutes), BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES);
    return { minutes, restart: true };
  }
  return { minutes: BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES, restart: false };
}

/** Foreground owner of the auto-submit timers, report notices and background cadence. */
export function startReportAutoSubmit() {
  let stopped = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;
  let cadenceTail: Promise<unknown> = Promise.resolve();

  const applyCadence = (cadence: BackgroundSyncCadence) => {
    // Unregister/register pairs must never interleave.
    cadenceTail = cadenceTail
      .then(() => setBackgroundSyncInterval(cadence.minutes, { restart: cadence.restart }))
      .catch((error) => logMobileError("report.autosubmit.cadence.failed", error));
    return cadenceTail;
  };

  const scheduleCountdown = (pass: AutoSubmitPass) => {
    if (countdownTimer) clearTimeout(countdownTimer);
    countdownTimer = null;
    const earliestMs = Math.min(...pass.armed.map((timer) => timer.remainingMs));
    if (!Number.isFinite(earliestMs) || stopped) return;
    countdownTimer = setTimeout(() => {
      countdownTimer = null;
      requestEvaluation();
    }, Math.min(earliestMs + timerSlackMs, 2_147_483_647));
  };

  const run = async (state: AppStateStatus, transition: boolean) => {
    const pass = await evaluateReportAutoSubmits();
    const summary = await runReportDeliveryNotices();
    if (stopped) return;
    scheduleCountdown(pass);
    const waiting = pass.armed.length > 0 || summary.needsDelivery;
    if (state === "active") {
      if (waiting) void maybePromptBatteryOptimizationExemption();
      // Back in the app with nothing waiting: leave the one-minute cadence.
      if (transition && !waiting) await applyCadence({ minutes: BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES, restart: false });
    } else if (transition) {
      await applyCadence(resolveBackgroundSyncCadence(pass, summary.needsDelivery));
    }
  };

  const runSafely = (state: AppStateStatus, transition: boolean) => {
    void run(state, transition).catch((error) => logMobileError("report.autosubmit.cycle.failed", error));
  };

  function requestEvaluation() {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runSafely(AppState.currentState, false);
    }, evaluationDebounceMs);
  }

  // A sync pass ends after every point edit (requestSyncAfterMutation), so
  // this also restarts the countdown when a point is changed.
  const unsubscribeSync = subscribeToSyncEvents(() => requestEvaluation());
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active" || state === "background") runSafely(state, true);
  });
  runSafely(AppState.currentState, true);

  return () => {
    stopped = true;
    unsubscribeSync();
    appStateSubscription.remove();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (countdownTimer) clearTimeout(countdownTimer);
  };
}
