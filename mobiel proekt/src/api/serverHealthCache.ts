export type HealthProbeValue = {
  ok: boolean;
  [key: string]: unknown;
};

export const serverHealthSuccessTtlMs = 30_000;
export const serverHealthFailureTtlMs = 3_000;

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
        this.entries.set(key, {
          value,
          expiresAt: Date.now() + (value.ok ? serverHealthSuccessTtlMs : serverHealthFailureTtlMs)
        });
        return value;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);
    return request;
  }

  invalidate(key?: string) {
    if (key) {
      this.entries.delete(key);
      return;
    }
    this.entries.clear();
  }
}
