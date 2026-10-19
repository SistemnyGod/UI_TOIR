type Snapshot = { directory: string; files: Map<string, number>; bytes: number; checkedAt: number };

/** Rebuild after process start, directory change or expiry; update known files in O(1). */
export function createMediaUsageTracker(scan: (directory: string) => Promise<Map<string, number>>, now = Date.now) {
  let snapshot: Snapshot | null = null;
  let revision = 0;
  let pending: { directory: string; promise: Promise<number> } | null = null;
  const lifetimeMs = 5 * 60_000;
  return {
    changing() { revision++; },
    async get(directory: string): Promise<number> {
      if (snapshot?.directory === directory && now() - snapshot.checkedAt < lifetimeMs) return snapshot.bytes;
      if (pending?.directory === directory) return pending.promise;
      const operation = { directory, promise: Promise.resolve(0) };
      operation.promise = (async () => {
        while (true) {
          const before = revision;
          const files = await scan(directory);
          if (before !== revision) continue;
          const bytes = [...files.values()].reduce((total, size) => total + size, 0);
          snapshot = { directory, files, bytes, checkedAt: now() };
          return bytes;
        }
      })().finally(() => { if (pending === operation) pending = null; });
      pending = operation;
      return operation.promise;
    },
    changed(directory: string, uri?: string, size?: number) {
      revision++;
      if (!snapshot || snapshot.directory !== directory) return;
      if (!uri || size === undefined || !Number.isSafeInteger(size) || size < 0) { snapshot = null; return; }
      snapshot.bytes += size - (snapshot.files.get(uri) ?? 0);
      if (size === 0) snapshot.files.delete(uri);
      else snapshot.files.set(uri, size);
    }
  };
}
