export type RetryableOutboxCommand = {
  status: string;
  nextAttemptAt: string | null;
};

const retryScheduleSeconds = [30, 60, 120, 300] as const;
const retryAfterCapSeconds = 24 * 60 * 60;
const retryAfterMinimumSeconds = 1;
const maxRetryDelaySeconds = 15 * 60;

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

export function resolveRetryDelaySeconds(
  retryAfterSeconds: number | null | undefined,
  attemptCount: number
): number {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    // A zero server delay would allow the same command into another batch of
    // the current run. Keep a one-second floor while honoring the server hint.
    return Math.min(
      Math.max(Math.ceil(retryAfterSeconds), retryAfterMinimumSeconds),
      retryAfterCapSeconds
    );
  }

  const attemptIndex = Math.max(0, Math.trunc(attemptCount) - 1);
  return retryScheduleSeconds[attemptIndex] ?? maxRetryDelaySeconds;
}