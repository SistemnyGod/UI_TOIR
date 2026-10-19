/** Share only overlapping operations; completed data is never reused across sessions. */
export function createScopedSingleFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, operation: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(operation).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
}
