import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { Text, TextInput, View } from "react-native";
import { createPatrolAppeal, loadMorePatrolAppeals, loadPatrolAppeals, readPatrolAppeals, readPatrolAppealsPage } from "@/db/repositories/patrolAppealRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
const statusLabels: Record<string, string> = { pending: "Сохранено на телефоне", open: "На рассмотрении", approved: "Отмена одобрена", rejected: "Отмена отклонена", obsolete: "Запрос неактуален", closed: "Закрыто", needsDispatcherDecision: "Диспетчер выбирает решение", reportAccepted: "Отчёт принят", cancellationSaved: "Отмена сохранена" };
export function PatrolAppealScreen() {
  const { assignmentId, kind } = useLocalSearchParams<{ assignmentId: string; kind?: string }>();
  const mode = kind === "cancel" ? "cancel" : "message";
  const { colors } = useAppTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPatrolAppeals>>>({ enabled: false, items: [] });
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const localCursorRef = useRef<string | null>(null);
  const localHasMoreRef = useRef(false);
  const contextRef = useRef<DataOwnerContext | null>(null);
  const generationRef = useRef(0);
  const load = useCallback(async (network = false) => {
    const generation = ++generationRef.current;
    const context = await captureDataOwnerContext();
    contextRef.current = context;
    try {
      const next = await (network ? loadPatrolAppeals(assignmentId) : readPatrolAppeals(assignmentId));
      await assertDataOwnerContext(context);
      if (generation !== generationRef.current) return;
      const firstPage = await readPatrolAppealsPage(assignmentId, mode, null);
      await assertDataOwnerContext(context);
      if (generation !== generationRef.current) return;
      localCursorRef.current = firstPage.nextCursor;
      localHasMoreRef.current = firstPage.nextCursor !== null;
      setData({ enabled: next.enabled, items: firstPage.items });
      setHasMore(localHasMoreRef.current || next.enabled);
    } catch (e) { if (generation === generationRef.current) setError(e instanceof Error ? e.message : "Не удалось прочитать обращения."); }
  }, [assignmentId, mode]);
  useFocusEffect(useCallback(() => {
    generationRef.current++;
    void load(true);
    requestMobileDataRefresh("appActive");
    return () => { generationRef.current++; };
  }, [load]));
  useFocusEffect(useCallback(() => {
    return subscribeToSyncEvents((event) => {
      const touchesAssignment = event.snapshotRefreshed === true
        || event.refreshedZones?.includes("requests") === true
        || event.changedAssignmentIds?.includes(assignmentId) === true
        || event.completedAssignmentIds.includes(assignmentId)
        || event.cancelledAssignmentIds?.includes(assignmentId) === true;
      if (touchesAssignment) void load(false);
    });
  }, [assignmentId, load]));
  const items = data.items.filter(item => item.kind === mode);
  const existing = mode === "cancel" ? items.find(item => ["pending", "open"].includes(item.status)) : undefined;
  async function send() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await createPatrolAppeal(assignmentId, mode, message); setMessage(""); await load(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить обращение."); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true); setError(null);
    const generation = generationRef.current;
    const context = contextRef.current;
    try {
      if (localHasMoreRef.current) {
        const page = await readPatrolAppealsPage(assignmentId, mode, localCursorRef.current);
        await assertDataOwnerContext(context ?? await captureDataOwnerContext());
        if (generation !== generationRef.current) return;
        localCursorRef.current = page.nextCursor;
        localHasMoreRef.current = page.nextCursor !== null;
        setData(previous => ({ ...previous, items: [...previous.items, ...page.items] }));
        setHasMore(localHasMoreRef.current || hasMore);
        return;
      }
      const cursor = await loadMorePatrolAppeals(assignmentId);
      if (!context || generation !== generationRef.current) return;
      await assertDataOwnerContext(context);
      if (!cursor) { setHasMore(false); return; }
      const page = await readPatrolAppealsPage(assignmentId, mode, localCursorRef.current);
      await assertDataOwnerContext(context);
      if (generation !== generationRef.current) return;
      localCursorRef.current = page.nextCursor;
      localHasMoreRef.current = page.nextCursor !== null;
      setData(previous => ({ ...previous, items: [...previous.items, ...page.items] }));
      setHasMore(localHasMoreRef.current || Boolean(cursor));
    } catch (e) { if (generation === generationRef.current) setError(e instanceof Error ? e.message : "Не удалось загрузить старые обращения."); }
    finally { if (generation === generationRef.current) setLoadingMore(false); }
  }
  return <ScreenList title={mode === "cancel" ? "Запрос отмены" : "Диспетчер"} subtitle="Ответ появится здесь после синхронизации."
    headerContent={<>
    {mode === "cancel" ? <Text style={{ color: colors.mutedText }}>Пока запрос рассматривается, вы можете продолжать и завершить обход.</Text> : null}
    {!data.enabled ? <Card><Text style={{ color: colors.text }}>Обновите данные: сервер должен поддерживать обращения.</Text></Card> : null}
    {!existing && data.enabled ? <Card><Text style={{ color: colors.text }}>{mode === "cancel" ? "Причина отмены" : "Новое сообщение"}</Text>
      <TextInput accessibilityLabel={mode === "cancel" ? "Причина отмены" : "Сообщение диспетчеру"} value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="Опишите ситуацию" placeholderTextColor={colors.mutedText} style={{ minHeight: 120, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: "top" }} />
      <PrimaryButton label={busy ? "Сохранение…" : "Отправить обращение"} disabled={busy || !message.trim()} onPress={() => void send()} />
    </Card> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{error}</Text> : null}
    </>}
    data={items}
    keyExtractor={item => item.id}
    ListEmptyComponent={<Text style={{ color: colors.mutedText }}>Обращений пока нет.</Text>}
    ListFooterComponent={hasMore ? <PrimaryButton label={loadingMore ? "Загрузка…" : "Загрузить ещё"} disabled={loadingMore} variant="secondary" onPress={() => void loadMore()} /> : null}
    renderItem={({ item }) => <Card><Text style={{ color: colors.mutedText }}>Вы · {new Date(item.createdAt).toLocaleString("ru-RU")}</Text><Text style={{ color: colors.text, fontWeight: "700" }}>{statusLabels[item.status] ?? item.status}</Text>
      <Text style={{ color: colors.text }}>{item.message}</Text>
      {item.reply ? <View><Text style={{ color: colors.mutedText }}>Ответ диспетчера</Text><Text style={{ color: colors.text }}>{item.reply}</Text></View> : null}
      {["rejected", "conflict", "blocked", "invalidPayload"].includes(item.delivery ?? "") ? <Text style={{ color: "#b91c1c" }}>Не доставлено. Проверьте очередь отправки в профиле.</Text> : null}
    </Card>} />;
}
