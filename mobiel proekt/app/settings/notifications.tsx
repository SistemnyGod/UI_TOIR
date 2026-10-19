import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Fragment, useCallback, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { countUnreadNotifications, listLocalNotifications } from "@/db/repositories/notificationRepository";
import { markAllMobileNotificationsRead, markMobileNotificationRead, syncMobileNotifications } from "@/services/notificationService";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { notificationDay, notificationPath } from "@/features/profile/notificationPresentation";
import { ScreenList } from "@/ui/Screen";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusMessage } from "@/ui/StatusMessage";
export default function NotificationsRoute() {
  const router = useRouter(); const { colors } = useAppTheme(); const [rows, setRows] = useState<MobileNotificationDto[]>([]); const [limit, setLimit] = useState(25); const [more, setMore] = useState(false); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0); const [markingAll, setMarkingAll] = useState(false); const [notice, setNotice] = useState<string | null>(null); const markAllLock = useRef(false);
  const epoch = useRef(0); const lock = useRef<number | null>(null); const pendingLocal = useRef(false);
  const load = useCallback(async (network: boolean, run: number) => {
    if (lock.current === run) { pendingLocal.current = true; return; }
    lock.current = run;
    if (network) setBusy(true);
    try { const scope = await captureDataOwnerContext();
      const read = async () => { const [data, unreadCount] = await Promise.all([listLocalNotifications(limit + 1), countUnreadNotifications(scope)]); await assertDataOwnerContext(scope); if (epoch.current === run) { setRows(previous => retainEqualItems(previous, data.slice(0, limit), item => item.id)); setMore(data.length > limit); setUnread(unreadCount); } };
      pendingLocal.current = false;
      await read();
      if (epoch.current !== run) return;
      if (network) { await syncMobileNotifications(); await read(); }
      while (epoch.current === run && pendingLocal.current) { pendingLocal.current = false; await read(); }
      if (epoch.current === run) setError(null);
    } catch { if (epoch.current === run) setError("Не удалось обновить уведомления. Сохранённые записи доступны."); }
    finally { if (epoch.current === run && lock.current === run) { lock.current = null; setBusy(false); } }
  }, [limit]);
  const markAll = useCallback(async () => {
    if (markAllLock.current) return;
    markAllLock.current = true; setMarkingAll(true); setNotice(null);
    const run = epoch.current;
    try {
      const result = await markAllMobileNotificationsRead();
      if (epoch.current === run) setNotice(result.pending > 0 ? "Отмечено прочитанным на телефоне. Отметка отправится на сервер, когда появится связь." : null);
    } catch { if (epoch.current === run) setNotice("Не удалось отметить уведомления прочитанными. Повторите попытку."); }
    finally { markAllLock.current = false; setMarkingAll(false); if (epoch.current === run) void load(false, run); }
  }, [load]);
  useFocusEffect(useCallback(() => {
    const run = ++epoch.current;
    void load(true, run);
    const unsubscribe = subscribeToSyncEvents(event => {
      if (epoch.current === run && (event.refreshedZones?.includes('notifications') || event.snapshotRefreshed)) void load(false, run);
    });
    return () => { epoch.current++; lock.current = null; pendingLocal.current = false; unsubscribe(); };
  }, [load]));
  return <ScreenList title="Уведомления" onBack={() => router.back()} data={rows} keyExtractor={row => row.id}
    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    headerContent={<>
    {error ? <StatusMessage message={error} tone="warning" /> : null}
    {notice ? <StatusMessage message={notice} tone="neutral" /> : null}
    <PrimaryButton label="Обновить" loading={busy} variant="secondary" onPress={() => void load(true, epoch.current)} />
    {unread > 0 ? <PrimaryButton label={`Прочитать все (${unread})`} loading={markingAll} variant="secondary" onPress={() => void markAll()} /> : null}
    </>}
    ListEmptyComponent={<Text style={{ color: colors.mutedText, fontSize: 16 }}>{busy ? 'Загружаем уведомления…' : 'После назначения обхода уведомления появятся здесь.'}</Text>}
    ListFooterComponent={more ? <PrimaryButton label="Загрузить ещё" disabled={busy} variant="secondary" onPress={() => setLimit(value => value + 25)} /> : null}
    renderItem={({ item: row, index }) => { const day = notificationDay(row.createdAt); const date = new Date(row.createdAt); return <Fragment>
      {index === 0 || day !== notificationDay(rows[index - 1].createdAt) ? <Text style={{ marginTop: 14, color: colors.mutedText, fontSize: 16, fontWeight: "700" }}>{day}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={row.title || "Уведомление"} onPress={() => {
        const run = epoch.current;
        if (!row.readAt) void markMobileNotificationRead(row.id).catch(() => {
          if (epoch.current !== run) return;
          if (lock.current !== null) pendingLocal.current = true;
          else void load(false, run);
        });
        const path = notificationPath(row); if (path) router.push(path as never); else Alert.alert(row.title || "Уведомление", row.message || "Без текста уведомления"); }} style={{ flexDirection: "row", gap: 12, paddingVertical: 16, borderTopWidth: 1, borderColor: colors.border, minHeight: 48 }}>
        <Ionicons name={row.entityType?.toLowerCase().includes("report") ? "document-text-outline" : "clipboard-outline"} size={24} color={colors.primary} />
        <View style={{ flex: 1, gap: 6 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: row.readAt ? "500" : "700" }}>{row.title || "Уведомление"}</Text><Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 20 }}>{row.message}</Text></View>
        <View style={{ gap: 12, alignItems: "flex-end" }}><Text style={{ color: colors.mutedText, fontSize: 14 }}>{Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</Text><Ionicons name="chevron-forward" size={18} color={colors.mutedText} /></View>
      </Pressable>
    </Fragment>; }} />;
}
