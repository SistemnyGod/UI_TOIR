import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { getOfflineSession } from "@/auth/tokenStorage";
import { getServerBaseUrl, subscribeToServerSettings } from "@/core/serverSettings";
import { getDatabase } from "@/db/database";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
export function useProfileIdentity() {
  const [identity, setIdentity] = useState({ account: "Загрузка…", server: "Загрузка…", unread: null as number | null });
  useFocusEffect(useCallback(() => {
    let active = true; let reading = false; let again = false;
    const read = () => { if (reading) { again = true; return; } reading = true; void (async () => {
      const owner = await captureDataOwnerContext(); const [session, server, db] = await Promise.all([getOfflineSession(), getServerBaseUrl(), getDatabase()]);
      const count = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM mobile_notifications WHERE owner_user_id = ? AND read_at IS NULL", [owner.ownerUserId]);
      await assertDataOwnerContext(owner);
      if (active) setIdentity({ account: session?.userId === owner.ownerUserId ? session.fullName : "Текущий аккаунт", server, unread: count?.count ?? 0 });
    })().catch(() => { if (active) setIdentity({ account: "Данные недоступны", server: "Данные недоступны", unread: null }); }).finally(() => { reading = false; if (active && again) { again = false; read(); } }); };
    read(); const sync = subscribeToSyncEvents(read); const settings = subscribeToServerSettings(read);
    return () => { active = false; sync(); settings(); };
  }, [])); return identity;
}
