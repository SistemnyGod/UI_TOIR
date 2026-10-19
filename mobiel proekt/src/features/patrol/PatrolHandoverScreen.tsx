import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getPatrolTransferCandidates } from "@/api/patrolTransferApi";
import {
  getPatrolTransferContext,
  listLocalTransferCandidates,
  transferAssignmentLocally,
  type PatrolTransferContext
} from "@/db/repositories/patrolTransferRepository";
import {
  mergeTransferCandidates,
  transferableStatuses,
  transferCandidateBlocker,
  type TransferCandidate
} from "@/domain/patrol/patrolTransferPolicy";
import { useAppTheme } from "@/features/settings/themePreference";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusMessage } from "@/ui/StatusMessage";
import { StatusPill } from "@/ui/StatusPill";
import { TextField } from "@/ui/TextField";
import { font, radius } from "@/ui/typography";

type LoadState = {
  context: PatrolTransferContext | null;
  candidates: TransferCandidate[];
  online: boolean;
  loaded: boolean;
};

const pendingLabels: Record<string, string> = {
  pending: "Ожидает отправки",
  sending: "Отправляется",
  retryLater: "Повторим отправку",
  waiting_network: "Ждём связь",
  waiting_auth: "Нужен вход",
  blocked: "Ждёт предыдущих данных"
};

/** Hands an unfinished patrol over to another employee of the shift. */
export function PatrolHandoverScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [state, setState] = useState<LoadState>({ context: null, candidates: [], online: false, loaded: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (withServer: boolean) => {
    const current = ++generation.current;
    try {
      const [context, local] = await Promise.all([getPatrolTransferContext(assignmentId), listLocalTransferCandidates()]);
      let server: TransferCandidate[] | null = null;
      if (withServer && context?.serverSupportsTransfer) {
        try { server = await getPatrolTransferCandidates(); } catch { server = null; }
      }
      if (current !== generation.current) return;
      setState(previous => ({
        context,
        candidates: mergeTransferCandidates(local, server ?? (withServer ? null : previous.candidates.filter(item => !item.sameAccount)), context?.performerId ?? null),
        online: withServer ? server !== null : previous.online,
        loaded: true
      }));
    } catch (caught) {
      if (current === generation.current) setError(caught instanceof Error ? caught.message : "Не удалось прочитать обход.");
    }
  }, [assignmentId]);

  useFocusEffect(useCallback(() => {
    void load(true);
    const unsubscribe = subscribeToSyncEvents(event => {
      if (event.changedAssignmentIds?.includes(assignmentId) || event.snapshotRefreshed === true) void load(false);
    });
    return () => { generation.current++; unsubscribe(); };
  }, [assignmentId, load]));

  const { context, candidates, online, loaded } = state;
  const selected = candidates.find(item => item.employeeId === selectedId) ?? null;
  const performer = context?.performerName ?? "текущий исполнитель";

  async function submit() {
    if (!selected || !context || busy) return;
    setBusy(true); setError(null);
    try {
      await transferAssignmentLocally({
        assignmentId,
        toEmployeeId: selected.employeeId,
        toEmployeeName: selected.fullName,
        sameAccount: selected.sameAccount,
        reason
      });
      if (selected.sameAccount) {
        router.replace(`/patrol/assignment/${assignmentId}` as never);
        return;
      }
      setHandedOver(selected.fullName);
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось передать обход.");
    } finally {
      setBusy(false);
    }
  }

  if (handedOver && (!context || context.pending)) {
    return <Screen title="Передать обход" subtitle={context?.routeName}>
      <EmptyState icon="paper-plane-outline" title={context ? "Передача сохранена" : "Обход передан"}
        text={context
          ? `${handedOver} получит обход на своём телефоне после синхронизации. Пока передача не отправлена, обход приостановлен на этом телефоне.`
          : `${handedOver} продолжит обход на своём телефоне. Заполненные точки остались за вами.`}
        action={<PrimaryButton label="К списку заявок" icon="list-outline" onPress={() => router.replace("/patrol/request-board" as never)} />} />
    </Screen>;
  }

  if (loaded && !context) {
    return <Screen title="Передать обход">
      <EmptyState icon="people-outline" title="Обход не найден" text="Возможно, он уже передан или закрыт. Обновите список заявок."
        action={<PrimaryButton label="К списку заявок" onPress={() => router.replace("/patrol/request-board" as never)} />} />
    </Screen>;
  }

  const unavailable = !context ? null
    : !context.serverSupportsTransfer ? "Обновите данные: сервер ещё не поддерживает передачу обхода."
    : !transferableStatuses.has(context.status) ? "Передать можно только начатый или приостановленный обход."
    : null;
  const blocker = selected && context ? transferCandidateBlocker(selected, context.status, online) : null;
  const canSubmit = Boolean(context && selected && !blocker && !unavailable && !context.pending && !busy);
  const groups = [
    { title: "На этом телефоне", items: candidates.filter(item => item.sameAccount) },
    { title: "На другом телефоне", items: candidates.filter(item => !item.sameAccount) }
  ];

  return <Screen title="Передать обход" subtitle={context?.routeName}
    bottomAction={context && !context.pending && !unavailable ? <PrimaryButton testID="handover-submit" icon="people-outline" size="large"
      label={busy ? "Передаём…" : selected ? `Передать: ${selected.fullName}` : "Выберите сотрудника"}
      disabled={!canSubmit} disabledReason={blocker ?? undefined} loading={busy} onPress={() => void submit()} /> : null}>
    {context ? <Card>
      <Text style={[font(700), { color: colors.mutedText, fontSize: 13 }]}>Сейчас выполняет</Text>
      <Text style={[font(800), { color: colors.text, fontSize: 18 }]}>{performer}</Text>
      <Text style={[font(600), { color: colors.text, fontSize: 15, lineHeight: 22 }]}>
        Заполнено точек: {context.filledPointCount} из {context.totalPointCount}. Они останутся за сотрудником «{performer}», остальные выполнит коллега.
      </Text>
    </Card> : null}

    {context?.pending ? <Card>
      <StatusPill tone="warning" label={pendingLabels[context.pending.status] ?? "Ожидает отправки"} />
      <Text style={[font(600), { color: colors.text, fontSize: 15, lineHeight: 22 }]}>
        Обход передаётся: {context.pending.toEmployeeName}. {context.pending.mode === "otherDevice" ? "Коллега увидит его на своём телефоне после синхронизации." : "Коллега продолжает обход на этом телефоне."}
      </Text>
      {context.pending.lastError ? <StatusMessage tone="danger" message={context.pending.lastError} /> : null}
    </Card> : null}

    {unavailable ? <StatusMessage tone="warning" message={unavailable} /> : null}
    {loaded && context && !context.pending && !unavailable && !online
      ? <StatusMessage tone="neutral" message="Нет связи с сервером: доступны сотрудники этого телефона. Передача на другой телефон станет доступна при связи." />
      : null}

    {context && !context.pending && !unavailable ? groups.map(group => group.items.length ? <View key={group.title} style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[font(800), { color: colors.text, fontSize: 16 }]}>{group.title}</Text>
      {group.items.map(candidate => {
        const reasonBlocked = transferCandidateBlocker(candidate, context.status, online);
        const active = candidate.employeeId === selectedId;
        return <Pressable key={candidate.employeeId} testID={`handover-candidate-${candidate.employeeId}`}
          accessibilityRole="radio" accessibilityState={{ selected: active, disabled: Boolean(reasonBlocked) }}
          accessibilityLabel={candidate.fullName} disabled={Boolean(reasonBlocked) || busy}
          onPress={() => setSelectedId(candidate.employeeId)}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1,
            borderColor: active ? colors.accent : colors.cardBorder, backgroundColor: active ? colors.tile : colors.card, opacity: reasonBlocked ? 0.6 : 1 }}>
          <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={active ? colors.accent : colors.mutedText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[font(700), { color: colors.text, fontSize: 16 }]}>{candidate.fullName}</Text>
            {candidate.position ? <Text style={[font(600), { color: colors.mutedText, fontSize: 13 }]}>{candidate.position}</Text> : null}
            {reasonBlocked ? <Text style={[font(600), { color: colors.warning, fontSize: 13 }]}>{reasonBlocked}</Text> : null}
          </View>
        </Pressable>;
      })}
    </View> : null) : null}

    {loaded && context && !context.pending && !unavailable && candidates.length === 0
      ? <EmptyState icon="people-outline" title="Некому передать" text="К этому телефону не привязаны другие сотрудники. Подключитесь к сети, чтобы увидеть коллег на других телефонах." />
      : null}

    {context && !context.pending && !unavailable ? <View style={{ gap: 6 }}>
      <Text style={[font(700), { color: colors.text, fontSize: 15 }]}>Причина (необязательно)</Text>
      <TextField accessibilityLabel="Причина передачи" value={reason} onChangeText={setReason} maxLength={500} multiline
        placeholder="Например: конец смены" placeholderTextColor={colors.placeholder} />
    </View> : null}

    {error ? <StatusMessage tone="danger" message={error} /> : null}
  </Screen>;
}
