export type HealthProbeValue = {
  ok: boolean;
  [key: string]: unknown;
};

export const serverHealthSuccessTtlMs = 30_000;
// A failure is remembered only briefly: on a field network the next attempt a
// few seconds later may already succeed, and a reconnect drops it at once.
export const serverHealthFailureTtlMs = 5_000;

type CacheEntry<TValue> = {
  value: TValue;
  expiresAt: number;
};

/** Keeps health probes short-lived so normal API calls do not add a round-trip. */
export class ServerHealthCache<TValue extends HealthProbeValue> {
  private readonly entries = new Map<string, CacheEntry<TValue>>();
  private readonly inFlight = new Map<string, Promise<TValue>>();

  get(key: string, now = Date.now()): TValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async getOrProbe(key: string, probe: () => Promise<TValue>, now = Date.now()): Promise<TValue> {
    const cached = this.get(key, now);
    if (cached) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = probe()
      .then((value) => {
        if (this.inFlight.get(key) === request) this.entries.set(key, {
          value,
          expiresAt: Date.now() + (value.ok ? serverHealthSuccessTtlMs : serverHealthFailureTtlMs)
        });
        return value;
      })
      .finally(() => { if (this.inFlight.get(key) === request) this.inFlight.delete(key); });

    this.inFlight.set(key, request);
    return request;
  }

  /** Forgets cached failures (and probes still in flight) but keeps fresh successes. */
  invalidateFailures() {
    for (const [key, entry] of this.entries) {
      if (!entry.value.ok) this.entries.delete(key);
    }
    this.inFlight.clear();
  }

  invalidate(key?: string) {
    if (key) {
      this.entries.delete(key);
      this.inFlight.delete(key);
      return;
    }
    this.entries.clear();
    this.inFlight.clear();
  }
}
