export interface CacheEntry { expiresAt: number; inFlight: boolean }

/** Session cache: LRU eviction of completed entries, with no cancellation of consumers. */
export class BoundedGetCache<T extends CacheEntry> {
  private readonly entries = new Map<string, T>();
  constructor(private readonly capacity = 128, private readonly now = Date.now) {}
  get size() { this.prune(); return this.entries.size; }
  get(key: string) {
    this.prune();
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.entries.set(key, entry); }
    return entry;
  }
  set(key: string, entry: T) {
    this.prune();
    this.entries.delete(key);
    while (this.entries.size >= this.capacity) {
      const victim = [...this.entries].find(([, value]) => !value.inFlight);
      // Requests beyond the capacity still execute, but their responses are not retained.
      if (!victim) return false;
      this.entries.delete(victim[0]);
    }
    this.entries.set(key, entry);
    return true;
  }
  delete(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
  private prune() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (!entry.inFlight && entry.expiresAt <= now) this.entries.delete(key);
  }
}
