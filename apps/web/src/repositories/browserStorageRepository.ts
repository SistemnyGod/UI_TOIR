export interface StoredStateEnvelope<T> {
  version: number;
  value: T;
}

export interface StoredStateOptions<T> {
  validate?: (value: unknown) => value is T;
  version?: number;
}

export function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readStoredState<T>(key: string, fallback: T, options: StoredStateOptions<T>): T {
  if (!canUseStorage()) return fallback;

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return fallback;

    const parsed = JSON.parse(rawValue) as Partial<StoredStateEnvelope<unknown>>;
    if (parsed.version !== (options.version ?? 1)) return fallback;
    if (options.validate && !options.validate(parsed.value)) return fallback;

    return parsed.value as T;
  } catch {
    return fallback;
  }
}

export function writeStoredState<T>(key: string, value: T, version: number) {
  if (!canUseStorage()) return;

  const envelope: StoredStateEnvelope<T> = { version, value };
  window.localStorage.setItem(key, JSON.stringify(envelope));
}
