import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { listMobileActionLog, MobileActionLogItem } from "@/db/repositories/mobileActionLogRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import {
  DiagnosticUploadResult,
  getDiagnosticSettingsSnapshot,
  runSafeDiagnosticTest,
  setAutomaticDiagnosticUploadEnabled,
  triggerManualDiagnosticReportUpload
} from "@/services/diagnosticReportService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type DiagnosticReportPreview = Awaited<ReturnType<typeof getDiagnosticSettingsSnapshot>>["recentReports"][number];

export function DiagnosticsSettingsScreen() {
  const { colors } = useAppTheme();
  const [automaticUploadEnabled, setAutomaticUploadEnabledState] = useState(true);
  const [reports, setReports] = useState<DiagnosticReportPreview[]>([]);
  const [events, setEvents] = useState<MobileActionLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [snapshot, recentEvents] = await Promise.all([
        getDiagnosticSettingsSnapshot(),
        listMobileActionLog(20)
      ]);
      setAutomaticUploadEnabledState(snapshot.automaticUploadEnabled);
      setReports(snapshot.recentReports);
      setEvents(recentEvents.filter(isDiagnosticEvent));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function toggleAutomaticUpload(enabled: boolean) {
    setAutomaticUploadEnabledState(enabled);
    await setAutomaticDiagnosticUploadEnabled(enabled);
    setFeedback(enabled ? "Автоотправка диагностических отчётов включена." : "Автоотправка выключена. Ручная отправка остаётся доступной.");
  }

  async function sendNow() {
    if (isSending) {
      return;
    }

    setIsSending(true);
    setFeedback(null);
    try {
      const result = await triggerManualDiagnosticReportUpload();
      setFeedback(uploadResultMessage(result));
      await load();
    } finally {
      setIsSending(false);
    }
  }

  async function runTest() {
    if (isSending) {
      return;
    }

    Alert.alert(
      "Проверить диагностику",
      "Приложение запишет тестовую ошибку в локальный журнал и попробует отправить диагностический отчёт. Реального падения приложения не будет.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Запустить",
          onPress: () => {
            void (async () => {
              setIsSending(true);
              setFeedback(null);
              try {
                const result = await runSafeDiagnosticTest();
                setFeedback(uploadResultMessage(result));
                await load();
              } finally {
                setIsSending(false);
              }
            })();
          }
        }
      ]
    );
  }

  return (
    <Screen title="Диагностика" subtitle="Ошибки, краш-логи и ручная отправка отчёта на сервер.">
      {isLoading ? <ActivityIndicator /> : null}

      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Автоматическая отправка</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Раз в сутки приложение отправляет краткий отчёт об ошибках, сбоях синхронизации и проблемах отправки.
            </Text>
          </View>
          <Switch value={automaticUploadEnabled} onValueChange={(value) => void toggleAutomaticUpload(value)} />
        </View>
        <View style={styles.pills}>
          <StatusPill label={automaticUploadEnabled ? "Включено" : "Выключено"} tone={automaticUploadEnabled ? "success" : "warning"} />
          <StatusPill label="Без паролей и токенов" tone="neutral" />
        </View>
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Ручная отправка</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Используйте, если отчёт не отправился, приложение ведёт себя нестабильно или нужно приложить диагностику к обращению.
        </Text>
        {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
        <PrimaryButton
          disabled={isSending}
          icon="cloud-upload-outline"
          label={isSending ? "Отправляем..." : "Отправить отчёт сейчас"}
          onPress={() => void sendNow()}
          size="large"
        />
        <PrimaryButton
          disabled={isSending}
          icon="bug-outline"
          label="Проверить отправку логов"
          onPress={() => void runTest()}
          variant="secondary"
        />
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Последние отчёты</Text>
        {reports.length === 0 ? (
          <Text style={[styles.text, { color: colors.mutedText }]}>Отчёты ещё не создавались.</Text>
        ) : reports.map((report) => (
          <View key={report.reportId} style={[styles.reportRow, { borderColor: colors.border }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{formatDateTime(report.createdAtLocal)}</Text>
                <Text style={[styles.text, { color: colors.mutedText }]}>
                  Событий: {report.entryCount}. Период: {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                </Text>
                {report.lastError ? <Text style={styles.errorText}>{report.lastError}</Text> : null}
              </View>
              <StatusPill label={report.status === "sent" ? "Отправлен" : "Ждёт"} tone={report.status === "sent" ? "success" : "warning"} />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Последние ошибки</Text>
        {events.length === 0 ? (
          <Text style={[styles.text, { color: colors.mutedText }]}>Критических ошибок в локальном журнале нет.</Text>
        ) : events.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => setExpandedEventId((current) => current === event.id ? null : event.id)}
            style={[styles.eventRow, { borderColor: colors.border }]}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{event.eventType}</Text>
                <Text style={[styles.text, { color: colors.mutedText }]}>{formatDateTime(event.createdAtLocal)}</Text>
              </View>
              <StatusPill label={event.entityType ?? "app"} tone="danger" />
            </View>
            <Text numberOfLines={expandedEventId === event.id ? undefined : 2} style={styles.errorText}>
              {event.message}
            </Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

function isDiagnosticEvent(event: MobileActionLogItem) {
  const value = `${event.eventType} ${event.message}`.toLowerCase();
  return value.includes("error")
    || value.includes("failed")
    || value.includes("rejected")
    || value.includes("conflict")
    || value.includes("crash")
    || value.includes("ошиб");
}

function uploadResultMessage(result: DiagnosticUploadResult) {
  switch (result.status) {
    case "sent":
      return "Диагностический отчёт отправлен на сервер.";
    case "notDue":
      return "Новых ошибок для отчёта нет.";
    case "disabled":
      return "Автоотправка выключена. Ручная отправка доступна.";
    case "offline":
      return "Нет подключения. Отчёт сохранён и будет отправлен позже.";
    case "unauthenticated":
      return "Нужно войти в приложение. Локальные логи сохранены.";
    case "failed":
      return `Не удалось отправить отчёт: ${result.message}`;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  errorText: {
    backgroundColor: "#fff1f1",
    borderColor: "#fecaca",
    borderRadius: 10,
    borderWidth: 1,
    color: "#991b1b",
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  eventRow: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  feedback: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 10,
    borderWidth: 1,
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    padding: 10
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800"
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  reportRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  title: {
    fontSize: 18,
    fontWeight: "800"
  }
});
