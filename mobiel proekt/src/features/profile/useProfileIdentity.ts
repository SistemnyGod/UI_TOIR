import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { getOfflineSession } from "@/auth/tokenStorage";
import { getServerBaseUrl, subscribeToServerSettings } from "@/core/serverSettings";
import { countUnreadNotifications } from "@/db/repositories/notificationRepository";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
export function useProfileIdentity() {
  const [identity, setIdentity] = useState({ account: "Загрузка…", server: "Загрузка…", unread: null as number | null });
  useFocusEffect(useCallback(() => {
    let active = true; let reading = false; let again = false;
    const read = () => { if (reading) { again = true; return; } reading = true; void (async () => {
      const owner = await captureDataOwnerContext(); const [session, server, unread] = await Promise.all([getOfflineSession(), getServerBaseUrl(), countUnreadNotifications(owner)]);
      await assertDataOwnerContext(owner);
      if (active) setIdentity({ account: session?.userId === owner.ownerUserId ? session.fullName : "Текущий аккаунт", server, unread });
    })().catch(() => { if (active) setIdentity({ account: "Данные недоступны", server: "Данные недоступны", unread: null }); }).finally(() => { reading = false; if (active && again) { again = false; read(); } }); };
    read(); const sync = subscribeToSyncEvents(read); const settings = subscribeToServerSettings(read);
    return () => { active = false; sync(); settings(); };
  }, [])); return identity;
}
