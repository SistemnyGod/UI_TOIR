import type { OutboxRetryReason } from "@/db/repositories/outboxTypes";

export type RetryableOutboxCommand = {
  status: string;
  nextAttemptAt: string | null;
};

type RandomSource = () => number;

// Transient failures (lost route, timeout, 5xx, rate limit without a hint)
// usually clear within seconds on a field network: 5 s, 10 s, 20 s, 40 s, 60 s.
const transientBaseSeconds = 5;
const transientMaxSeconds = 60;
// A failure the client cannot explain is retried more patiently so a poison
// command cannot hammer the server: 30 s, 1, 2, 5 and then 15 minutes.
const unknownScheduleSeconds = [30, 60, 120, 300] as const;
const unknownMaxSeconds = 15 * 60;
// The connection monitor re-probes every 30 s and wakes the queue as soon as
// the server answers again, so a failed health check does not need a tighter loop.
const serverUnreachableSeconds = 30;
const retryAfterCapSeconds = 24 * 60 * 60;
const retryAfterMinimumSeconds = 1;
const jitterRatio = 0.2;

const transientReasons = new Set<OutboxRetryReason>(["network", "timeout", "server", "rateLimit"]);

export function isOutboxCommandReady(command: RetryableOutboxCommand, nowIso: string): boolean {
  if (command.status === "pending") {
    return true;
  }

  if (command.status !== "retryLater") {
    return false;
  }

  return command.nextAttemptAt === null || command.nextAttemptAt <= nowIso;
}

export function filterReadyOutboxCommands<T extends RetryableOutboxCommand>(
  commands: readonly T[],
  nowIso: string
): T[] {
  return commands.filter((command) => isOutboxCommandReady(command, nowIso));
}

export function isTransientRetryReason(reason: OutboxRetryReason | null | undefined): boolean {
  return reason ? transientReasons.has(reason) : false;
}

/**
 * Seconds until the next attempt. A server Retry-After hint is honored as is
 * (bounded); otherwise the delay follows the reason's schedule with ±20 %
 * jitter so phones that regain a shared Wi-Fi do not retry in lockstep.
 */
export function resolveRetryDelaySeconds(
  retryAfterSeconds: number | null | undefined,
  attemptCount: number,
  retryReason: OutboxRetryReason | null = "unknown",
  random: RandomSource = Math.random
): number {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    // A zero server delay would allow the same command into another batch of
    // the current run. Keep a one-second floor while honoring the server hint.
    return Math.min(
      Math.max(Math.ceil(retryAfterSeconds), retryAfterMinimumSeconds),
      retryAfterCapSeconds
    );
  }

  const attemptIndex = Math.max(0, Math.trunc(Number.isFinite(attemptCount) ? attemptCount : 1) - 1);
  const baseSeconds = isTransientRetryReason(retryReason)
    ? Math.min(transientBaseSeconds * 2 ** Math.min(attemptIndex, 16), transientMaxSeconds)
    : unknownScheduleSeconds[attemptIndex] ?? unknownMaxSeconds;
  return applyJitter(baseSeconds, random);
}

/** Delay after the pre-flight health check failed; no command was sent. */
export function resolveServerUnreachableDelaySeconds(random: RandomSource = Math.random): number {
  return applyJitter(serverUnreachableSeconds, random);
}

function applyJitter(baseSeconds: number, random: RandomSource) {
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0.5;
  const factor = 1 - jitterRatio + unit * 2 * jitterRatio;
  return Math.max(retryAfterMinimumSeconds, Math.round(baseSeconds * factor));
}
