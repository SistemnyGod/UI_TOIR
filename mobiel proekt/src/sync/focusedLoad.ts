type FocusedLoadOptions<Scope, Value> = {
  capture: () => Promise<Scope>;
  assert: (scope: Scope) => Promise<void>;
  read: (scope: Scope) => Promise<Value>;
  publish: (value: Value) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
};

/** One reader per focus session; events during a read request one fresh pass. */
export function createFocusedLoad<Scope, Value>(options: FocusedLoadOptions<Scope, Value>) {
  let active = true;
  let dirty = false;
  let pending: Promise<void> | null = null;
  async function drain() {
    try {
      do {
        dirty = false;
        try {
          const scope = await options.capture();
          if (!active) return;
          const value = await options.read(scope);
          await options.assert(scope);
          if (!active) return;
          // A newer mutation was announced while this snapshot was being read.
          if (!dirty) options.publish(value);
        } catch (error) {
          if (!active) return;
          if (!dirty) options.onError(error);
        }
      } while (active && dirty);
    } catch (error) {
      if (active) options.onError(error);
    } finally {
      pending = null;
      if (active) options.onSettled();
    }
  }
  return {
    run() {
      if (!active) return Promise.resolve();
      if (pending) { dirty = true; return pending; }
      pending = drain();
      return pending;
    },
    stop() { active = false; dirty = false; }
  };
}
