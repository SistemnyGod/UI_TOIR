import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getCompleteReportDeliveryState } from "@/db/repositories/outboxRepository";
import { completeAssignmentLocally, getReportReadiness, ReportReadiness } from "@/db/repositories/patrolRepository";
import { getReportDeliveryPresentation } from "@/features/patrol/reportDeliveryPresentation";
import { groupReportProblems, ReportProblemGroup } from "@/features/patrol/reportReadinessPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import { shouldReloadAssignmentAfterSync, subscribeToSyncEvents } from "@/sync/syncEvents";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { readBackgroundSyncState } from "@/sync/backgroundSyncState";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { OutboxCommandStatus } from "@/domain/sync/syncTypes";

type DeliveryState = { clientOperationId: string; status: OutboxCommandStatus; lastError: string | null; attemptCount: number; updatedAtLocal: string | null } | null;

export function SubmitReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(null);

  useEffect(
    () => subscribeToSyncEvents((event) => {
      if (shouldReloadAssignmentAfterSync(event, assignmentId)) {
        setReloadRevision((value) => value + 1);
      }
    }),
    [assignmentId]
  );

  const load = useCallback(() => {
    let isMounted = true;

    setLoadError(null);
    void Promise.all([getReportReadiness(assignmentId), loadDelivery(assignmentId), readBackgroundSyncState()])
      .then(([loadedReadiness, loadedDelivery, syncState]) => {
        if (isMounted) {
          setReadiness(loadedReadiness);
          setDelivery(loadedDelivery);
          setLastSuccessfulSyncAt(syncState.lastSuccessfulSyncAt);
        }
      })
      .catch((error) => {
        void logMobileError("report.screen.load.failed", error);
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ Р»РѕРєР°Р»СЊРЅС‹Р№ РѕС‚С‡С‘С‚.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [assignmentId, reloadRevision]);

  useFocusEffect(load);

  const presentation = useMemo(
    () => getReportDeliveryPresentation(delivery?.status ?? null, delivery?.lastError ?? null),
    [delivery]
  );
  const problemGroups = useMemo(
    () => groupReportProblems(readiness?.problems ?? []),
    [readiness]
  );

  async function handlePrimaryAction() {
    if (isSubmitting) {
      return;
    }

    if (presentation.action === "serverSettings") {
      router.push("/(auth)/server-settings");
      return;
    }

    if (presentation.action === "repair") {
      router.push(`/patrol/assignment/${assignmentId}/all-points`);
      return;
    }

    if (presentation.action === "signIn") {
      router.push("/(auth)/login");
      return;
    }

    if (presentation.action === "done") {
      router.replace("/(tabs)/patrol");
      return;
    }

    if (!readiness?.ready && (presentation.action === "submit" || presentation.action === "resubmit")) {
      return;
    }

    setIsSubmitting(true);
    setSyncNotice(null);

    try {
      if (presentation.action === "submit" || presentation.action === "resubmit") {
        await completeAssignmentLocally(assignmentId);
        setDelivery(await loadDelivery(assignmentId));
      }

      const syncResult = await triggerForegroundSyncWithRetry({ forceRetry: true });
      setDelivery(await loadDelivery(assignmentId));

      if (syncResult.skipped === "offline") {
        setSyncNotice("РќРµС‚ РїРѕРґРєР»СЋС‡РµРЅРёСЏ. РћС‚С‡РµС‚ СЃРѕС…СЂР°РЅРµРЅ Рё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕРІС‚РѕСЂРёС‚СЃСЏ РїРѕСЃР»Рµ РїРѕСЏРІР»РµРЅРёСЏ СЃРµС‚Рё.");
      } else if (syncResult.skipped === "serverUnavailable") {
        setSyncNotice("РЎРµСЂРІРµСЂ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РћС‚С‡РµС‚ РѕСЃС‚Р°РµС‚СЃСЏ РЅР° С‚РµР»РµС„РѕРЅРµ; СЃР»РµРґСѓСЋС‰РёР№ РїРѕРІС‚РѕСЂ СѓР¶Рµ Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅ.");
      } else if (syncResult.skipped === "unauthenticated") {
        setSyncNotice("РЎРµСЃСЃРёСЏ РґРµР№СЃС‚РІРёС‚РµР»СЊРЅРѕ РёСЃС‚РµРєР»Р°. РћС‚С‡РµС‚ СЃРѕС…СЂР°РЅРµРЅ РЅР° С‚РµР»РµС„РѕРЅРµ Рё РѕС‚РїСЂР°РІРёС‚СЃСЏ РїРѕСЃР»Рµ РІС…РѕРґР°.");
      } else if (syncResult.skipped === "failed") {
        setSyncNotice("РћС‚РїСЂР°РІРєР° РїСЂРµСЂРІР°Р»Р°СЃСЊ. Р”Р°РЅРЅС‹Рµ СЃРѕС…СЂР°РЅРµРЅС‹ вЂ” РјРѕР¶РЅРѕ РїРѕРІС‚РѕСЂРёС‚СЊ СЃРµР№С‡Р°СЃ РёР»Рё РґРѕР¶РґР°С‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕР№ РѕС‚РїСЂР°РІРєРё.");
      }
    } catch (error) {
      setDelivery(await loadDelivery(assignmentId));
      setSyncNotice(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ РѕС‚РїСЂР°РІРєСѓ. РћС‚С‡РµС‚ СЃРѕС…СЂР°РЅРµРЅ РЅР° С‚РµР»РµС„РѕРЅРµ.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openProblem(problem: ReportProblemGroup) {
    if (problem.pointId === "route-empty") {
      router.push(`/patrol/assignment/${assignmentId}/all-points`);
      return;
    }

    router.push(`/patrol/assignment/${assignmentId}/point/${problem.pointId}/fill`);
  }

  function handleScreenPrimaryAction() {
    if (!readiness?.ready && problemGroups[0]) {
      openProblem(problemGroups[0]);
      return;
    }

    void handlePrimaryAction();
  }

  if (!readiness) {
    return (
      <Screen title="РћС‚РїСЂР°РІРєР° РѕС‚С‡РµС‚Р°" subtitle="РџСЂРѕРІРµСЂСЏРµРј С‚РѕС‡РєРё Рё Р»РѕРєР°Р»СЊРЅРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рµ РґР°РЅРЅС‹Рµ.">
        {loadError ? (
          <Card>
            <Text style={styles.loadError}>{loadError}</Text>
            <PrimaryButton
              icon="refresh-outline"
              label="РџРѕРІС‚РѕСЂРёС‚СЊ РїСЂРѕРІРµСЂРєСѓ"
              onPress={() => setReloadRevision((value) => value + 1)}
              variant="secondary"
            />
          </Card>
        ) : <ActivityIndicator />}
      </Screen>
    );
  }

  const actionDisabled = isSubmitting || (!readiness.ready && problemGroups.length === 0);
  const primaryLabel = !readiness.ready && problemGroups[0]
    ? problemGroups[0].pointId === "route-empty" ? "РћС‚РєСЂС‹С‚СЊ СЃРїРёСЃРѕРє С‚РѕС‡РµРє" : `РџРµСЂРµР№С‚Рё Рє С‚РѕС‡РєРµ ${problemGroups[0].orderIndex}`
    : presentation.buttonLabel;
  const primaryIcon = !readiness.ready ? "arrow-forward-outline" : actionIcon(presentation.action);

  return (
    <Screen title="РџСЂРѕРІРµСЂРєР° РѕС‚С‡С‘С‚Р°" subtitle="РСЃРїСЂР°РІСЊС‚Рµ РЅРµР·Р°РїРѕР»РЅРµРЅРЅС‹Рµ С‚РѕС‡РєРё РёР»Рё Р·Р°РІРµСЂС€РёС‚Рµ РѕР±С…РѕРґ.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>{readiness.assignment?.routeName ?? "РћР±С…РѕРґ"}</Text>
          <StatusPill
            label={readiness.ready ? "Р’СЃРµ С‚РѕС‡РєРё Р·Р°РїРѕР»РЅРµРЅС‹" : `РћСЃС‚Р°Р»РѕСЃСЊ: ${problemGroups.length}`}
            tone={readiness.ready ? "success" : "warning"}
          />
        </View>
        <View style={styles.progressRow}>
          <ProgressValue label="РџСЂРѕР№РґРµРЅРѕ" value={`${readiness.progress.completed}/${readiness.progress.total}`} />
          <ProgressValue label="Р—Р°РјРµС‡Р°РЅРёСЏ" value={String(readiness.progress.issues)} />
          <ProgressValue label="РћС‚Р»РѕР¶РµРЅРѕ" value={String(readiness.progress.deferred)} />
        </View>
      </Card>

      <DeliveryCard
        detail={presentation.detail}
        lastUpdate={delivery?.updatedAtLocal ?? null}
        title={isSubmitting ? "РџСЂРѕРІРµСЂСЏРµРј РґРѕСЃС‚Р°РІРєСѓвЂ¦" : presentation.title}
        tone={presentation.tone}
        status={delivery?.status ?? null}
      />

      {readiness.problems.length > 0 ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>РќСѓР¶РЅРѕ Р·Р°РїРѕР»РЅРёС‚СЊ РїРµСЂРµРґ РѕС‚РїСЂР°РІРєРѕР№</Text>
          {problemGroups.map((problem) => (
            <ProblemGroupButton
              key={problem.pointId}
              onPress={() => openProblem(problem)}
              problem={problem}
            />
          ))}
        </Card>
      ) : null}

      <Text style={styles.syncStatusLine}>{"\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u0443\u0441\u043f\u0435\u0448\u043d\u0430\u044f \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f: "}{lastSuccessfulSyncAt ? formatDateTime(lastSuccessfulSyncAt) : "\u0435\u0449\u0451 \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b\u0430\u0441\u044c"}</Text>
      {syncNotice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{syncNotice}</Text> : null}
      {loadError ? <Text accessibilityLiveRegion="polite" style={styles.loadError}>{loadError}</Text> : null}

      <View style={styles.primaryAction}>
        <PrimaryButton
          disabled={actionDisabled}
          icon={primaryIcon}
          label={isSubmitting ? "РџСЂРѕРІРµСЂСЏРµРј РґРѕСЃС‚Р°РІРєСѓвЂ¦" : primaryLabel}
          onPress={handleScreenPrimaryAction}
          size="large"
        />
      </View>

      <View style={styles.secondaryLinks}>
        <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.secondaryLink}>
          <Ionicons color={colors.primary} name="list-outline" size={18} />
          <Text style={[styles.secondaryLinkText, { color: colors.primary }]}>Р’СЃРµ С‚РѕС‡РєРё</Text>
        </Pressable>
        {presentation.action !== "done" ? (
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => router.push("/settings/sync-queue" as never)} style={styles.secondaryLink}>
            <Ionicons color={colors.primary} name="cloud-upload-outline" size={18} />
            <Text style={[styles.secondaryLinkText, { color: colors.primary }]}>РџРѕРґСЂРѕР±РЅРµРµ РѕР± РѕС‚РїСЂР°РІРєРµ</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

async function loadDelivery(assignmentId: string) {
  const ownerUserId = await getStoredOwnerUserId();
  return ownerUserId ? getCompleteReportDeliveryState(ownerUserId, assignmentId) : null;
}

function actionIcon(action: ReturnType<typeof getReportDeliveryPresentation>["action"]): keyof typeof Ionicons.glyphMap {
  switch (action) {
    case "retry":
      return "refresh-outline";
    case "repair":
      return "build-outline";
    case "resubmit":
      return "send-outline";
    case "signIn":
      return "log-in-outline";
    case "done":
      return "checkmark-circle-outline";
    default:
      return "send-outline";
  }
}

function DeliveryCard({
  detail,
  lastUpdate,
  title,
  tone,
  status
}: {
  detail: string;
  lastUpdate: string | null;
  title: string;
  tone: "neutral" | "success" | "warning" | "danger";
  status: NonNullable<DeliveryState>["status"] | null;
}) {
  const palette = deliveryPalette[tone];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.deliveryCard, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <View style={[styles.deliveryIcon, { backgroundColor: palette.iconBackground }]}>
        <Ionicons color={palette.color} name={palette.icon} size={24} />
      </View>
      <View style={styles.deliveryText}>
        <Text style={[styles.deliveryTitle, { color: palette.color }]}>{title}</Text>
        <Text style={styles.deliveryDetail}>{detail}</Text>
        <Text style={styles.deliveryState}>{deliveryStateLabel(status)}</Text>
        {lastUpdate ? <Text style={styles.deliveryTime}>РћР±РЅРѕРІР»РµРЅРѕ {formatTime(lastUpdate)}</Text> : null}
      </View>
    </View>
  );
}

function ProblemGroupButton({
  onPress,
  problem
}: {
  onPress: () => void;
  problem: ReportProblemGroup;
}) {
  const { colors } = useAppTheme();
  const title = `${problem.orderIndex}. ${problem.pointName}`;

  return (
    <Pressable
      accessibilityLabel={`${title}. ${problem.reasons.join(". ")}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.problemButton,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed ? styles.problemButtonPressed : null
      ]}
    >
      <View style={styles.problemHeader}>
        <View style={styles.problemTitleRow}>
          <Ionicons color="#b45309" name="alert-circle-outline" size={20} />
          <Text style={[styles.problemTitle, { color: colors.text }]}>{title}</Text>
        </View>
        <Ionicons color={colors.primary} name="chevron-forward" size={20} />
      </View>
      <View style={styles.problemReasons}>
        {problem.reasons.map((reason) => (
          <View key={reason} style={styles.problemReasonRow}>
            <View style={styles.problemReasonDot} />
            <Text style={[styles.problemReason, { color: colors.mutedText }]}>{reason}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function ProgressValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressValue}>
      <Text style={styles.progressLabel}>{label}</Text>
      <Text style={styles.progressNumber}>{value}</Text>
    </View>
  );
}

function deliveryStateLabel(status: OutboxCommandStatus | null) {
  if (status === "accepted" || status === "duplicate") return "\u0421\u0435\u0440\u0432\u0435\u0440: \u043f\u0440\u0438\u043d\u044f\u0442";
  if (status === "pending" || status === "sending") return "\u0422\u0435\u043b\u0435\u0444\u043e\u043d: \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u2014 \u0441\u0435\u0440\u0432\u0435\u0440: \u043e\u0436\u0438\u0434\u0430\u0435\u0442";
  if (status === "retryLater" || status === "waiting_network") return "\u0422\u0435\u043b\u0435\u0444\u043e\u043d: \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u2014 \u0441\u0435\u0440\u0432\u0435\u0440: \u043f\u043e\u0432\u0442\u043e\u0440 \u043f\u043e\u0437\u0436\u0435";
  if (status === "rejected" || status === "conflict" || status === "invalidPayload") return "\u0422\u0435\u043b\u0435\u0444\u043e\u043d: \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u2014 \u0441\u0435\u0440\u0432\u0435\u0440: \u043d\u0443\u0436\u043d\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435";
  return "\u0422\u0435\u043b\u0435\u0444\u043e\u043d: \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const deliveryPalette = {
  neutral: { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", iconBackground: "#dbeafe", icon: "cloud-upload-outline" as const },
  success: { background: "#ecfdf5", border: "#bbf7d0", color: "#15803d", iconBackground: "#dcfce7", icon: "checkmark-circle-outline" as const },
  warning: { background: "#fffbeb", border: "#fde68a", color: "#b45309", iconBackground: "#fef3c7", icon: "time-outline" as const },
  danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c", iconBackground: "#fee2e2", icon: "alert-circle-outline" as const }
};

const styles = StyleSheet.create({
  deliveryCard: {
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15
  },
  deliveryDetail: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20
  },
  deliveryIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  deliveryText: {
    flex: 1,
    gap: 4
  },
  deliveryState: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  deliveryTime: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  deliveryTitle: {
    fontSize: 17,
    fontWeight: "900"
  },
  loadError: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20
  },
  syncStatusLine: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  notice: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    padding: 12
  },
  primaryAction: {
    marginTop: 2
  },
  secondaryLinks: {
    alignItems: "flex-start",
    gap: 2
  },
  secondaryLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  secondaryLinkText: {
    fontSize: 14,
    fontWeight: "800"
  },
  problemButton: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    minHeight: 56,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  problemButtonPressed: {
    opacity: 0.72
  },
  problemHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  problemReason: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19
  },
  problemReasonDot: {
    backgroundColor: "#f59e0b",
    borderRadius: 3,
    height: 6,
    marginTop: 7,
    width: 6
  },
  problemReasonRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9
  },
  problemReasons: {
    gap: 5,
    paddingLeft: 29,
    paddingRight: 20
  },
  problemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  problemTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minWidth: 0
  },
  progressLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  progressNumber: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  progressRow: {
    flexDirection: "row",
    gap: 8
  },
  progressValue: {
    backgroundColor: "#f6f9fe",
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: 0,
    padding: 10
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800"
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800"
  }
});
