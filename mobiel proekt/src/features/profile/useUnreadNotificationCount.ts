import { useEffect, useState } from "react";
import { countUnreadNotifications } from "@/db/repositories/notificationRepository";
import { subscribeToSyncEvents } from "@/sync/syncEvents";

/** Local unread count for the current owner; null while it cannot be read. */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true; let reading = false; let again = false;
    const read = () => {
      if (reading) { again = true; return; }
      reading = true;
      void countUnreadNotifications()
        .then(value => { if (active) setCount(value); })
        .catch(() => { if (active) setCount(null); })
        .finally(() => { reading = false; if (active && again) { again = false; read(); } });
    };
    read();
    const unsubscribe = subscribeToSyncEvents(event => {
      if (!event.refreshedZones || event.refreshedZones.includes("notifications") || event.snapshotRefreshed) read();
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  return count;
}

export function unreadBadgeLabel(count: number | null) {
  if (!count || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
