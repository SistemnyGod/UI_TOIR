import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActiveAssignment,
  getAssignmentByRequestId,
  getRequestBoardItem,
  releaseAcceptedRequestLocally,
  RequestBoardItem,
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { logMobileError } from "@/services/mobileErrorReporter";
import { listMobileEmployees } from "@/db/repositories/workTaskRepository";
import type { MobileEmployeeDto } from "@/domain/patrol/patrolTypes";
import { ActionSheet } from "@/ui/ActionSheet";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { StatusMessage } from "@/ui/StatusMessage";
import { enterPatrolRequest } from '@/services/patrolEntryService';
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';

export function PatrolRequestScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [employeeChoice, setEmployeeChoice] = useState<{ requestId: string; employeeId: string | undefined } | null>(null);
  const employeeId = employeeChoice?.requestId === requestId ? employeeChoice.employeeId : undefined;
  const setEmployeeId = (value: string) => setEmployeeChoice({ requestId, employeeId: value });
  const loadVersion = useRef(0);
  const [employeePicker, setEmployeePicker] = useState(false);
  const [request, setRequest] = useState<RequestBoardItem | null>(null);
  const [assignment, setAssignment] = useState<ActiveAssignment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const actionInProgressRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const focusVersion = useRef(0);
  const focused = useRef(false);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    try {
      const scope = await captureDataOwnerContext();
      const [item, existing] = await Promise.all([getRequestBoardItem(requestId), getAssignmentByRequestId(requestId)]);
      const availableEmployees = await listMobileEmployees();
      await assertDataOwnerContext(scope);
      if (version !== loadVersion.current || !focused.current) return;
      setRequest(item);
      setEmployees(availableEmployees);
      setEmployeeChoice(previous => {
        const current = previous?.requestId === requestId ? previous.employeeId : undefined;
        const selected = current && availableEmployees.some(employee => employee.employeeId === current) ? current : undefined;
        return { requestId, employeeId: existing?.employeeId ?? (item?.performerSelectionAvailable ? selected : item?.assignedEmployeeId) ?? (availableEmployees.length === 1 ? availableEmployees[0].employeeId : undefined) };
      });
      setAssignment(existing);
      setLoadError(null);
    } finally {
      if (version === loadVersion.current && focused.current) {
        hasLoadedRef.current = true;
        setIsLoading(false);
      }
    }
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      focused.current = true;
      focusVersion.current++;
      void load().catch((caught) => {
        void logMobileError("patrol.request.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать заявку.");
        }
      });
      return () => {
        isMounted = false;
        focused.current = false;
        loadVersion.current++;
        focusVersion.current++;
      };
    }, [load])
  );

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    const currentAssignmentId = assignment?.assignmentId;
    const touchesRequest = event.refreshedZones?.some((zone) => zone === "requests" || zone === "activePatrols") === true
      || (currentAssignmentId ? event.changedAssignmentIds?.includes(currentAssignmentId) === true : false)
      || (currentAssignmentId ? event.completedAssignmentIds.includes(currentAssignmentId) : false)
      || (currentAssignmentId ? event.cancelledAssignmentIds?.includes(currentAssignmentId) === true : false);
    if (!touchesRequest) return;
    void load().catch((caught) => {
      void logMobileError("patrol.request.sync-load.failed", caught);
      setLoadError(caught instanceof Error ? caught.message : "Не удалось обновить заявку.");
    });
  }), [assignment?.assignmentId, load]));

  async function runAction(action: () => Promise<void>) {
    if (actionInProgressRef.current) {
      return;
    }
    actionInProgressRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить действие.");
    } finally {
      actionInProgressRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleStart() {
    const version = focusVersion.current;
    await runAction(async () => {
      try {
        const scope = await captureDataOwnerContext();
        const path = await enterPatrolRequest(requestId, employeeId, () => focused.current && focusVersion.current === version);
        await assertDataOwnerContext(scope);
        if (focused.current && focusVersion.current === version) router.replace(path as never);
      } catch (caught) {
        await load();
        throw caught;
      }
    });
  }

  function handleRelease() {
    if (!assignment) {
      return;
    }

    Alert.alert(
      "Вернуть заявку?",
      "Заявка снова появится в списке доступных. Это можно сделать только до начала обхода.",
      [
        { text: "Оставить", style: "cancel" },
        {
          text: "Вернуть",
          style: "destructive",
          onPress: () => {
            void runAction(async () => {
              await releaseAcceptedRequestLocally(assignment.assignmentId);
              setAssignment(null);
              setRequest((current) => current ? { ...current, status: current.assignedFullName ? "assigned" : "available" } : current);
              router.replace("/patrol/request-board");
            });
          }
        }
      ]
    );
  }

  if (isLoading) {
    return (
      <Screen title="Заявка" subtitle="Карточка заявки на обход.">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (loadError && !request) {
    return (
      <Screen title="Заявка" subtitle="Карточка заявки на обход.">
        <Card>
          <Text style={[styles.error, { color: colors.danger }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void load()} variant="secondary" />
        </Card>
      </Screen>
    );
  }
  if (!request) {
    return (
      <Screen title="Заявка" subtitle="Карточка заявки на обход.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Заявка не найдена на телефоне.</Text>
        </Card>
        <PrimaryButton icon="arrow-back-outline" label="Назад к списку" onPress={() => router.replace("/patrol/request-board")} variant="secondary" />
      </Screen>
    );
  }

  const canAccept = (request.status === "available" || request.status === "assigned") && (!assignment || assignment.status === "assigned");
  const canStart = assignment?.status === "accepted" || assignment?.status === "paused";
  const canRelease = assignment?.status === "accepted" && !assignment.startedAtLocal;
  const canOpenNfc = assignment?.status === "inProgress";
  const canOpenReview = assignment && !canAccept && !canStart && !canOpenNfc;

  return (
    <Screen title="Заявка на обход" floatingNotice={loadError ? <StatusMessage message={loadError} tone="warning" /> : undefined} bottomAction={<>
      {canAccept ? <PrimaryButton loading={isSubmitting} disabled={isSubmitting || (!request.assignedEmployeeId && !employeeId)} disabledReason={!request.assignedEmployeeId && !employeeId ? "Сначала выберите исполнителя обхода." : undefined} icon="play-outline" label="Начать обход" onPress={handleStart} size="large" /> : null}
      {canStart ? <PrimaryButton disabled={isSubmitting} icon="play-outline" label={assignment?.status === "paused" ? "Продолжить обход" : "Начать обход"} onPress={handleStart} /> : null}
      {canOpenNfc ? <PrimaryButton disabled={isSubmitting} icon="scan-outline" label="Продолжить" onPress={handleStart} /> : null}
      {canOpenReview ? <PrimaryButton disabled={isSubmitting} icon="document-text-outline" label="Открыть отчёт" onPress={() => router.replace(`/patrol/assignment/${assignment.assignmentId}`)} /> : null}
    </>}>
      <Card>
        <View style={styles.headerRow}>
          <StatusPill label={statusLabel(assignment?.status ?? request.status)} tone={statusTone(assignment?.status ?? request.status)} />
          {request.displayNumber ? <Text style={[styles.displayNumber, { color: colors.mutedText }]}>{request.displayNumber}</Text> : null}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{request.routeName}</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>{request.assignedFullName ?? "Свободная заявка"}</Text>
        <View style={styles.infoGrid}>
          <Info label="Начало" value={formatDateTime(request.plannedStartAt)} />
          <Info label="Состояние" value={statusLabel(assignment?.status ?? request.status)} />
        </View>
        <View style={[styles.nextStepBox, { backgroundColor: colors.backgroundAccent }]}>
          <Text style={[styles.nextStepLabel, { color: colors.primary }]}>Следующий шаг</Text>
          <Text style={[styles.text, { color: colors.text }]}>{actionHint(assignment?.status ?? request.status)}</Text>
        </View>
      </Card>

      {canAccept && !request.assignedEmployeeId ? <Card>
        <Text style={[styles.title, { color: colors.text }]}>Кто выполняет обход</Text>
        <PrimaryButton variant="secondary" label={employees.find((item) => item.employeeId === employeeId)?.fullName ?? "Выберите сотрудника"} onPress={() => setEmployeePicker(true)} />
        <Text style={{ color: colors.mutedText }}>Исполнитель указывается отдельно от общего аккаунта.</Text>
      </Card> : null}
      <ActionSheet title="Исполнитель обхода" visible={employeePicker} onClose={() => setEmployeePicker(false)}
        actions={employees.map((employee) => ({ label: employee.fullName, icon: "person-outline" as const, onPress: () => setEmployeeId(employee.employeeId) }))} />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}

      <View style={styles.secondaryRow}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/patrol/request-board")} style={styles.linkButton}>
          <Ionicons color={colors.primary} name="arrow-back-outline" size={18} />
          <Text style={[styles.linkLabel, { color: colors.primary }]}>К списку заявок</Text>
        </Pressable>
        {canRelease ? (
          <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={() => setIsMenuOpen(true)} style={styles.iconButton}>
            <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
          </Pressable>
        ) : null}
      </View>
      <ActionSheet
        actions={canRelease ? [{ label: "Вернуть заявку", icon: "return-up-back-outline", danger: true, onPress: handleRelease }] : []}
        onClose={() => setIsMenuOpen(false)}
        title="Действия с заявкой"
        visible={isMenuOpen}
      />
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.infoCell, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "available":
      return "Доступна";
    case "assigned":
      return "Назначена";
    case "accepted":
      return "Принята";
    case "inProgress":
      return "В работе";
    case "paused":
      return "Приостановлена";
    case "completedLocal":
    case "syncing":
      return "Ждет отправки";
    case "syncError":
      return "Ошибка отправки";
    case "authRequired":
      return "Нужно войти";
    case "needsDispatcherDecision":
      return "Решение диспетчера";
    case "cancelledServer":
    case "cancelled":
      return "Отменена";
    default:
      return "История";
  }
}

function statusTone(status: string) {
  if (status === "available" || status === "assigned" || status === "accepted") {
    return "success";
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "cancelled") {
    return "danger";
  }
  if (status === "paused" || status === "completedLocal" || status === "syncing" || status === "needsDispatcherDecision") {
    return "warning";
  }
  return "neutral";
}

function actionHint(status: string) {
  switch (status) {
    case "available":
    case "assigned":
      return "Нажмите «Начать обход»: приложение примет заявку и откроет прохождение маршрута.";
    case "accepted":
      return "Заявка принята, обход еще не начат. Можно начать обход или вернуть заявку в список.";
    case "paused":
      return "Обход на паузе. Можно продолжить с сохраненным прогрессом.";
    case "inProgress":
      return "Обход уже идет. Откройте его, чтобы сканировать метки или отправить отчет.";
    case "completedLocal":
    case "syncing":
      return "Отчёт сохранён на телефоне. Откройте итог, чтобы проверить отправку.";
    case "syncError":
    case "authRequired":
      return "Есть проблема с отправкой. Данные сохранены; откройте отчёт, чтобы увидеть причину.";
    case "cancelledServer":
    case "cancelled":
      return "Заявка отменена диспетчером. Начинать обход по ней не нужно.";
    case "needsDispatcherDecision":
      return "По заявке нужно решение диспетчера. Локальные данные сохранены.";
    default:
      return "Проверьте маршрут, время и статус. Доступные действия показаны ниже.";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  displayNumber: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  title: {
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    lineHeight: 28
  },
  text: {
    fontSize: 16,
    lineHeight: 21
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Manrope_800ExtraBold"
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  infoCell: {
    backgroundColor: "#f8fafc",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    gap: 3,
    padding: 10
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
    textTransform: "uppercase"
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  nextStepBox: {
    backgroundColor: "#eef4ff",
    borderRadius: 12,
    gap: 4,
    padding: 12
  },
  nextStepLabel: {
    color: "#1e5bff",
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
    textTransform: "uppercase"
  },
  secondaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  linkButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  linkLabel: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  iconButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});
