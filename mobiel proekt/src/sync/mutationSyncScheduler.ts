export type MutationSyncRunner = () => Promise<unknown>;

export type MutationSyncScheduler = {
  request: () => void;
  dispose: () => void;
};

/**
 * Coalesces sync requests raised by local mutations without making the
 * mutation wait for the network. A request arriving during a pass schedules
 * exactly one additional pass after the active pass completes.
 */
export function createMutationSyncScheduler(
  runSync: MutationSyncRunner,
  debounceMs = 0
): MutationSyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let requested = false;

  const schedule = () => {
    if (timer || active) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (active || !requested) {
        return;
      }

      requested = false;
      active = true;
      void Promise.resolve()
        .then(runSync)
        .catch(() => undefined)
        .finally(() => {
          active = false;
          if (requested) {
            schedule();
          }
        });
    }, debounceMs);
  };

  return {
    request() {
      requested = true;
      schedule();
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      requested = false;
    }
  };
}
