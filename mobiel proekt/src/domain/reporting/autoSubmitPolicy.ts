/**
 * Auto-submit of a finished patrol report the employee forgot to send.
 *
 * The timer measures elapsed time, not wall-clock time: a phone whose clock is
 * changed (manually, by the operator, after a dead battery) must neither send
 * the report early nor postpone it forever. Within one app process the elapsed
 * time comes from a monotonic clock. Across process restarts, where JS has no
 * monotonic clock, only forward wall-clock progress is counted: a clock set
 * back adds nothing, a clock set forward while the app was dead can at most
 * send an already complete report sooner.
 */
export const defaultAutoSubmitDelayMs = 15 * 60_000;
export const autoSubmitReminderLeadMs = 5 * 60_000;
/** While a point form is open the report waits; afterwards it gets this much time. */
export const autoSubmitEditGraceMs = 60_000;

export type AutoSubmitTimer = {
  assignmentId: string;
  /** Digest of every point result and attachment; any edit changes it. */
  fingerprint: string;
  delayMs: number;
  elapsedMs: number;
  /** Wall clock of the last accounting step, used only across restarts. */
  checkpointWallMs: number;
};

export type AutoSubmitObservation = {
  assignmentId: string;
  /** Every point filled, the patrol still in progress and no report queued. */
  ready: boolean;
  fingerprint: string;
  nowWallMs: number;
  /** Monotonic time since this process's last checkpoint for the timer, or null after a restart. */
  monotonicDeltaMs: number | null;
  /** A point form is open in the foreground. */
  editing: boolean;
};

export type AutoSubmitDecision =
  | { action: "disarm" }
  | { action: "wait"; timer: AutoSubmitTimer; remainingMs: number; armed: boolean }
  | { action: "submit"; timer: AutoSubmitTimer };

export function evaluateAutoSubmit(
  timer: AutoSubmitTimer | null,
  observation: AutoSubmitObservation,
  delayMs = defaultAutoSubmitDelayMs
): AutoSubmitDecision {
  // An incomplete patrol is never sent on the employee's behalf.
  if (!observation.ready) {
    return { action: "disarm" };
  }

  if (!timer || timer.assignmentId !== observation.assignmentId || timer.fingerprint !== observation.fingerprint) {
    const armedTimer: AutoSubmitTimer = {
      assignmentId: observation.assignmentId,
      fingerprint: observation.fingerprint,
      delayMs: normalizeDelay(delayMs),
      elapsedMs: 0,
      checkpointWallMs: observation.nowWallMs
    };
    return { action: "wait", timer: armedTimer, remainingMs: armedTimer.delayMs, armed: true };
  }

  const timerDelayMs = normalizeDelay(timer.delayMs);
  let elapsedMs = Math.max(0, finiteOr(timer.elapsedMs, 0)) + elapsedSinceCheckpoint(timer, observation);
  if (observation.editing) {
    elapsedMs = Math.min(elapsedMs, Math.max(0, timerDelayMs - autoSubmitEditGraceMs));
  }

  const next: AutoSubmitTimer = {
    ...timer,
    delayMs: timerDelayMs,
    elapsedMs,
    checkpointWallMs: observation.nowWallMs
  };
  if (elapsedMs >= timerDelayMs) {
    return { action: "submit", timer: next };
  }
  return { action: "wait", timer: next, remainingMs: timerDelayMs - elapsedMs, armed: false };
}

/** Milliseconds from now until the reminder; 0 when it is already due. */
export function reminderDelayMs(remainingMs: number, leadMs = autoSubmitReminderLeadMs) {
  return Math.max(0, remainingMs - leadMs);
}

function elapsedSinceCheckpoint(timer: AutoSubmitTimer, observation: AutoSubmitObservation) {
  if (observation.monotonicDeltaMs !== null) {
    return Math.max(0, finiteOr(observation.monotonicDeltaMs, 0));
  }
  return Math.max(0, finiteOr(observation.nowWallMs - timer.checkpointWallMs, 0));
}

function normalizeDelay(delayMs: number) {
  return Math.max(60_000, finiteOr(delayMs, defaultAutoSubmitDelayMs));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

/** Stable 53-bit digest (cyrb53); collisions only matter for reset detection. */
export function digestText(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
