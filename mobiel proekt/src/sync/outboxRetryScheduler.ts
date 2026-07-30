import { getNextOutboxRetryAt } from "@/db/repositories/outboxRepository";

type TimerHandle = ReturnType<typeof setTimeout>;
type RetrySchedulerRunner = () => Promise<unknown>;
type RetrySchedulerRunResult = {
  sent?: number;
};

type RetrySchedulerDependencies = {
  getNextRetryAt: (ownerUserId: string) => Promise<string | null>;
  runSync: () => Promise<unknown>;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  now?: () => number;
  isRunnerAvailable?: () => boolean;
};

export type OutboxRetryScheduler = {
  schedule: (ownerUserId: string | null | undefined) => Promise<void>;
  cancel: () => void;
};

const maximumTimerDelayMs = 2_147_483_647;
const minimumNoProgressDelayMs = 15 * 60_000;
let registeredRunner: RetrySchedulerRunner | null = null;

export function createOutboxRetryScheduler(dependencies: RetrySchedulerDependencies): OutboxRetryScheduler {
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const now = dependencies.now ?? Date.now;
  let timer: TimerHandle | null = null;
  let generation = 0;

  const clearCurrentTimer = () => {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const cancel = () => {
    generation += 1;
    clearCurrentTimer();
  };

  const schedule = async (ownerUserId: string | null | undefined, minimumDelayMs = 0) => {
    const scheduleGeneration = ++generation;
    clearCurrentTimer();
    if (!ownerUserId) {
      return;
    }

    const nextRetryAt = await dependencies.getNextRetryAt(ownerUserId);
    if (scheduleGeneration !== generation || dependencies.isRunnerAvailable?.() === false) {
      return;
    }

    const nextRetryAtMs = nextRetryAt ? Date.parse(nextRetryAt) : Number.NaN;
    if (!Number.isFinite(nextRetryAtMs)) {
      return;
    }

    const delayMs = Math.min(
      Math.max(nextRetryAtMs - now(), minimumDelayMs, 0),
      maximumTimerDelayMs
    );
    timer = setTimer(() => {
      timer = null;
      if (scheduleGeneration !== generation || dependencies.isRunnerAvailable?.() === false) {
        return;
      }

      void dependencies.runSync()
        .catch(() => undefined)
        .then((result) => {
          if (scheduleGeneration === generation) {
            const retryDelay = delayMs === 0 && isNoProgress(result)
              ? minimumNoProgressDelayMs
              : 0;
            void schedule(ownerUserId, retryDelay);
          }
        });
    }, delayMs);
  };

  return { schedule, cancel };
}

const retryScheduler = createOutboxRetryScheduler({
  getNextRetryAt: getNextOutboxRetryAt,
  runSync: async () => registeredRunner?.(),
  isRunnerAvailable: () => registeredRunner !== null
});

export function registerOutboxRetrySchedulerRunner(runner: RetrySchedulerRunner) {
  registeredRunner = runner;
}

export function scheduleNextOutboxRetry(ownerUserId: string | null | undefined) {
  return retryScheduler.schedule(ownerUserId);
}

export function cancelNextOutboxRetry() {
  retryScheduler.cancel();
}
function isNoProgress(result: unknown): result is RetrySchedulerRunResult {
  if (!result || typeof result !== "object") {
    return false;
  }
  return "sent" in result && (result as RetrySchedulerRunResult).sent === 0;
}
