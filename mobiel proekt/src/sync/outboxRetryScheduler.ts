import { getNextOutboxRetryAt } from "@/db/repositories/outboxRepository";

type TimerHandle = ReturnType<typeof setTimeout>;
type RetrySchedulerRunner = () => Promise<unknown>;

type RetrySchedulerDependencies = {
  getNextRetryAt: (ownerUserId: string) => Promise<string | null>;
  runSync: () => Promise<unknown>;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  now?: () => number;
};

export type OutboxRetryScheduler = {
  schedule: (ownerUserId: string | null | undefined) => Promise<void>;
  cancel: () => void;
};

const maximumTimerDelayMs = 2_147_483_647;
let registeredRunner: RetrySchedulerRunner | null = null;

export function createOutboxRetryScheduler(dependencies: RetrySchedulerDependencies): OutboxRetryScheduler {
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const now = dependencies.now ?? Date.now;
  let timer: TimerHandle | null = null;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const schedule = async (ownerUserId: string | null | undefined) => {
    cancel();
    if (!ownerUserId) {
      return;
    }

    const nextRetryAt = await dependencies.getNextRetryAt(ownerUserId);
    const nextRetryAtMs = nextRetryAt ? Date.parse(nextRetryAt) : Number.NaN;
    if (!Number.isFinite(nextRetryAtMs)) {
      return;
    }

    const timerGeneration = generation;
    const delayMs = Math.min(Math.max(nextRetryAtMs - now(), 0), maximumTimerDelayMs);
    timer = setTimer(() => {
      timer = null;
      if (timerGeneration !== generation) {
        return;
      }

      void dependencies.runSync()
        .catch(() => undefined)
        .finally(() => {
          if (timerGeneration === generation) {
            void schedule(ownerUserId);
          }
        });
    }, delayMs);
  };

  return { schedule, cancel };
}

const retryScheduler = createOutboxRetryScheduler({
  getNextRetryAt: getNextOutboxRetryAt,
  runSync: async () => registeredRunner?.()
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