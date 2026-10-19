/**
 * Phone clock versus server clock. Patrol times in reports come from the
 * phone, so a wrong phone clock silently produces wrong reports. Every mobile
 * API response carries the server time (X-Server-Now, or the standard Date
 * header on older servers); the offset is server minus phone.
 */
export const CLIENT_NOW_HEADER = "X-Client-Now";
export const SERVER_NOW_HEADER = "X-Server-Now";

/** The guard is warned when the phone clock is off by more than this. */
export const CLOCK_SKEW_WARNING_MS = 3 * 60_000;
/** A sample from a slower round trip is too imprecise to keep. */
const MAX_SAMPLE_ROUND_TRIP_MS = 30_000;
/** A sample restored after an app restart is trusted for this long. */
const RESTORED_SAMPLE_TTL_MS = 72 * 60 * 60_000;
const storageKey = "patrol360.clock.offset";

// Loaded lazily: the HTTP client imports this module and must not pull in
// native storage modules just to send a header.
const loadSecureStore = () => import("expo-secure-store");

export type ClockOffsetSample = {
  offsetMs: number;
  roundTripMs: number;
  /** Phone time when the sample was taken. */
  measuredAt: string;
};

export type ClockOffsetSnapshot = {
  offsetMs: number;
  roundTripMs: number;
  measuredAt: string;
} | null;

type Clock = { now: () => number; monotonic: () => number };

const defaultClock: Clock = {
  now: () => Date.now(),
  monotonic: () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now())
};

/** Server time from response headers in ms, or null when absent or unreadable. */
export function readServerTime(getHeader: (name: string) => string | null | undefined) {
  for (const name of [SERVER_NOW_HEADER, "Date"]) {
    const value = getHeader(name);
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Offset of the server clock from the phone clock, assuming the server
 * stamped its time halfway through the round trip.
 */
export function computeClockOffsetSample(input: {
  requestStartedAt: number;
  responseReceivedAt: number;
  serverTimeMs: number;
}): ClockOffsetSample | null {
  const roundTripMs = input.responseReceivedAt - input.requestStartedAt;
  if (!Number.isFinite(input.serverTimeMs) || roundTripMs < 0 || roundTripMs > MAX_SAMPLE_ROUND_TRIP_MS) {
    return null;
  }
  const midpoint = input.requestStartedAt + roundTripMs / 2;
  return {
    offsetMs: Math.round(input.serverTimeMs - midpoint),
    roundTripMs,
    measuredAt: new Date(input.responseReceivedAt).toISOString()
  };
}

export function isClockSkewSignificant(offsetMs: number | null | undefined) {
  return typeof offsetMs === "number" && Math.abs(offsetMs) > CLOCK_SKEW_WARNING_MS;
}

/** "Часы телефона отстают на 7 мин." — a positive offset means the phone is behind. */
export function describeClockSkew(offsetMs: number) {
  const totalMinutes = Math.round(Math.abs(offsetMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const amount = hours > 0 ? `${hours} ч${minutes > 0 ? ` ${minutes} мин` : ""}` : `${minutes} мин`;
  return `Часы телефона ${offsetMs > 0 ? "отстают" : "спешат"} на ${amount}.`;
}

type LiveSample = ClockOffsetSample & { serverTimeAtMonotonic: number | null; monotonicAt: number | null };

let clock: Clock = defaultClock;
let current: LiveSample | null = null;
let lastPersisted: ClockOffsetSample | null = null;
let restorePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
let version = 0;

/**
 * Current offset. Within the process that took the sample, phone clock
 * changes are followed through the monotonic clock, so fixing the phone time
 * offline clears the warning without a new server contact.
 */
export function getClockOffsetSnapshot(): ClockOffsetSnapshot {
  if (!current) return null;
  const offsetMs = current.monotonicAt !== null && current.serverTimeAtMonotonic !== null
    ? Math.round(current.serverTimeAtMonotonic + (clock.monotonic() - current.monotonicAt) - clock.now())
    : current.offsetMs;
  return { offsetMs, roundTripMs: current.roundTripMs, measuredAt: current.measuredAt };
}

/** Changes whenever a new sample arrives; a stable value for useSyncExternalStore. */
export function getClockOffsetVersion() {
  return version;
}

export function subscribeToClockOffset(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Called by the HTTP client for every mobile API response. Never throws. */
export function observeServerClock(
  getHeader: (name: string) => string | null | undefined,
  requestStartedAt: number,
  responseReceivedAt: number
) {
  try {
    const serverTimeMs = readServerTime(getHeader);
    if (serverTimeMs === null) return;
    const sample = computeClockOffsetSample({ requestStartedAt, responseReceivedAt, serverTimeMs });
    if (!sample) return;
    if (current && current.monotonicAt !== null && current.roundTripMs < sample.roundTripMs
      && clock.monotonic() - current.monotonicAt < 60_000) {
      // A sample from the last minute with a faster round trip is more precise.
      return;
    }
    current = { ...sample, monotonicAt: clock.monotonic(), serverTimeAtMonotonic: clock.now() + sample.offsetMs };
    notify();
    persistIfChanged(sample);
  } catch {
    // Clock diagnostics must never break a request.
  }
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function persistIfChanged(sample: ClockOffsetSample) {
  const changed = !lastPersisted
    || Math.abs(lastPersisted.offsetMs - sample.offsetMs) > 30_000
    || Date.parse(sample.measuredAt) - Date.parse(lastPersisted.measuredAt) > 60 * 60_000;
  if (!changed) return;
  lastPersisted = sample;
  void loadSecureStore()
    .then((SecureStore) => SecureStore.setItemAsync(storageKey, JSON.stringify(sample)))
    .catch(() => undefined);
}

/** Restores the last sample after a restart, so an offline start still warns. */
export function restoreClockOffset() {
  restorePromise ??= (async () => {
    try {
      const stored = await (await loadSecureStore()).getItemAsync(storageKey);
      if (!stored || current) return;
      const sample = JSON.parse(stored) as Partial<ClockOffsetSample>;
      if (typeof sample.offsetMs !== "number" || typeof sample.roundTripMs !== "number" || typeof sample.measuredAt !== "string") return;
      const age = clock.now() - Date.parse(sample.measuredAt);
      if (!Number.isFinite(age) || Math.abs(age) > RESTORED_SAMPLE_TTL_MS) return;
      const restored = { offsetMs: sample.offsetMs, roundTripMs: sample.roundTripMs, measuredAt: sample.measuredAt };
      lastPersisted = restored;
      // The monotonic clock of the previous process is meaningless here.
      current = { ...restored, monotonicAt: null, serverTimeAtMonotonic: null };
      notify();
    } catch {
      // No stored sample: the warning waits for the next server response.
    }
  })();
  return restorePromise;
}

export function resetClockOffsetForTests(testClock: Clock = defaultClock) {
  clock = testClock;
  current = null;
  lastPersisted = null;
  restorePromise = null;
  version = 0;
  listeners.clear();
}
