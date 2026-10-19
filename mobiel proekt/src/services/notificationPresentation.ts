// A bounded window for repeated native callbacks. The server also persists
// delivery receipts; this cache is not a substitute for server idempotency.
export function createNotificationIdWindow(limit = 256) {
  const ids = new Set<string>();
  return {
    claim(id: string) {
      if (!id) return true;
      if (ids.has(id)) return false;
      ids.add(id);
      if (ids.size > limit) ids.delete(ids.values().next().value!);
      return true;
    },
    release(id: string) { ids.delete(id); }
  };
}

export function readNotificationData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const direct = Object.fromEntries(Object.entries(source).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  ));
  if (typeof source.dataString !== "string") return direct;
  try {
    const decoded: unknown = JSON.parse(source.dataString);
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      return { ...direct, ...Object.fromEntries(Object.entries(decoded).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )) };
    }
  } catch { /* Keep the directly supplied fields when the payload is malformed. */ }
  return direct;
}

export function isPresentedByNativeAndroid(payload: unknown, platform: string) {
  // Expo presents direct FCM data messages with title/message itself. Creating
  // another local alert here duplicates both foreground and background push.
  if (platform !== "android" || !payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  // Only the raw FCM fields trigger native presentation. A title nested inside
  // dataString/body is application data and still needs a local notification.
  return [data.title, data.message].some(value => typeof value === "string" && value.trim().length > 0);
}
