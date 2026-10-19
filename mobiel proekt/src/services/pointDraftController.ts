/** Owns one form session. Timers retain their session epoch. */
export function createFormDraftController<T>(write: (value: T) => Promise<void>, onError: (error: unknown) => void, delay = 400) {
  let value: T;
  let dirty = false;
  let epoch = 0;
  let closed = false;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();
  let revision = 0;
  let destination: (() => void) | undefined;
  let leavePromise: Promise<void> | undefined;
  function cancel() { if (timer) clearTimeout(timer); timer = undefined; }
  async function flush() {
    cancel();
    if (closed || paused || !dirty) return chain;
    const snapshot = value;
    const version = revision;
    const session = epoch;
    const next = chain.catch(() => undefined).then(async () => {
      if (closed || session !== epoch) return;
      await write(snapshot);
      if (version === revision) dirty = false;
    });
    chain = next;
    return next;
  }
  /**
   * Drain all revisions entered before a navigation action. Input remains
   * accepted while the chain is running; a newer revision schedules another
   * write before the caller is allowed to leave the screen.
   */
  async function flushUntilSettled(afterSaved?: () => void) {
    cancel();
    while (!closed && !paused) {
      const expected = revision;
      await flush();
      if (expected === revision && !dirty) {
        if (afterSaved) {
          // Do not yield between checking the latest input and handing off navigation.
          cancel(); closed = true; epoch++;
          try { afterSaved(); }
          catch (error) { closed = false; throw error; }
        }
        return;
      }
      // A callback may have supplied a newer value while the previous write
      // was in flight. The next iteration captures that value.
    }
  }
  return {
    update(next: T) {
      if (closed || paused) return;
      value = next; dirty = true; revision++; cancel();
      const session = epoch;
      timer = setTimeout(() => { if (session === epoch && !closed && !paused) void flush().catch(onError); }, delay);
    },
    flush,
    flushUntilSettled,
    requestLeave(action: () => void) {
      destination ??= action;
      if (leavePromise) return leavePromise;
      const operation = flushUntilSettled(() => {
        destination?.();
        destination = undefined;
      });
      leavePromise = operation;
      void operation.then(() => { if (leavePromise === operation) leavePromise = undefined; }, () => { if (leavePromise === operation) leavePromise = undefined; });
      return operation;
    },
    async pause() { cancel(); paused = true; await chain.catch(() => undefined); },
    resume() { if (!closed) paused = false; },
    close() { cancel(); closed = true; epoch++; },
    get dirty() { return dirty; }
  };
}

export const createPointDraftController = createFormDraftController;
