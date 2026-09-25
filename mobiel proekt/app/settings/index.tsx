import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { useConnectionStatus } from "@/core/connectionStatus";
import { getDatabase } from "@/db/database";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getPatrolDeviceContext } from "@/db/repositories/patrolContextRepository";
import { readBackgroundSyncState } from "@/sync/backgroundSyncState";
import { getPatrolOfflineReadiness } from "@/db/repositories/patrolOfflineReadinessRepository";

export default function SettingsRoute() {
  const router = useRouter();
  const { colors, effectiveScheme, preference } = useAppTheme();
  const connection = useConnectionStatus();
  const [summary, setSummary] = useState({ pending: 0, files: 0, points: 0, employees: 0, sections: 0, snapshotReady: false, readinessReason: "Маршрут не выбран", syncAt: null as string | null });
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const owner = await getStoredOwnerUserId();
      if (!owner) {
        if (mounted) setSummary({ pending: 0, files: 0, points: 0, employees: 0, sections: 0, snapshotReady: false, readinessReason: "Маршрут не выбран", syncAt: null });
        return;
      }
      const [db, context, sync] = await Promise.all([getDatabase(), getPatrolDeviceContext(), readBackgroundSyncState()]);
      const [pending, files, readiness, employees, sections] = await Promise.all([
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND status NOT IN ('accepted', 'duplicate', 'cancelled', 'superseded')", [owner, currentContourId]),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM files WHERE owner_user_id = ? AND (contour_id = ? OR contour_id IS NULL) AND server_file_id IS NULL", [owner, currentContourId]),
        getPatrolOfflineReadiness(owner, context.assignmentId),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM mobile_employees WHERE owner_user_id = ?", [owner]),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM emu_sections")
      ]);
      if (mounted) {
        setSummary({ pending: pending?.count ?? 0, files: files?.count ?? 0, points: readiness.pointCount, employees: employees?.count ?? 0, sections: sections?.count ?? 0, snapshotReady: readiness.ready, readinessReason: readiness.reason, syncAt: sync.lastSuccessfulSyncAt });
        setSummaryError(null);
      }
    })().catch(() => {
      if (mounted) {
        setSummary(prev => ({ ...prev, snapshotReady: false }));
        setSummaryError("Не удалось прочитать локальное состояние. Повторите открытие настроек.");
      }
    });
    return () => { mounted = false; };
  }, []));

  return (
    <Screen title="Настройки" subtitle="Персонализация, аккаунт, сервер, диагностика и восстановление отправки.">
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Связь и отправка</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>Последняя успешная синхронизация: {summary.syncAt ? new Date(summary.syncAt).toLocaleString("ru-RU") : "ещё не было"}.</Text>
          </View>
          <StatusPill label={connection === "connected" ? "На связи" : connection === "authorizationRequired" ? "Нужен вход" : "Нет связи"} tone={connection === "connected" ? "success" : "warning"} />
        </View>
        <SettingsRow label="Ожидают отправки" value={`${summary.pending} действий, ${summary.files} файлов`} onPress={() => router.push("/settings/sync-queue" as never)} />
        {connection === "authorizationRequired" ? <SettingsRow label="Войти" value="Подтвердить доступ к серверу" onPress={() => router.push("/(auth)/login")} /> : null}
        {connection !== "connected" && connection !== "authorizationRequired" ? <SettingsRow label="Проверить очередь" value="Посмотреть сохранённые результаты и ошибки" onPress={() => router.push("/settings/sync-queue" as never)} /> : null}
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Работа без сети</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>Текущий маршрут: {summary.points > 0 ? `загружено точек: ${summary.points}` : "не выбран или ещё не загружен"}.</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>Справочники: сотрудников — {summary.employees}, участков — {summary.sections}.</Text>
        <StatusPill label={summary.snapshotReady ? "Готовность подтверждена" : "Готовность не подтверждена"} tone={summary.snapshotReady ? "success" : "warning"} />
        <Text style={[styles.text, { color: colors.mutedText }]}>{summary.readinessReason}.</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>Результаты и фотографии остаются на телефоне до подтверждения сервером.</Text>
        {summaryError ? <Text style={[styles.text, { color: "#b91c1c" }]}>{summaryError}</Text> : null}
      </Card>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Внешний вид</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Сейчас: {themeLabel(preference)}. Активная схема: {effectiveScheme === "dark" ? "тёмная" : "светлая"}.
            </Text>
          </View>
          <StatusPill label={effectiveScheme === "dark" ? "Тёмная" : "Светлая"} tone="neutral" />
        </View>
        <SettingsRow label="Тема" value="Системная, светлая или тёмная" onPress={() => router.push("/settings/theme")} />
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Аккаунт</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Смена пользователя безопасно проверяет локальные заявки, результаты, фото, видео и очередь отправки.
        </Text>
        <SettingsRow label="Аккаунт и выход" value="Сменить пользователя безопасно" onPress={() => router.push("/settings/account")} />
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Синхронизация</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Проверьте отчёты, команды и файлы, которые ещё не приняты сервером.
        </Text>
        <SettingsRow
          label="Не отправлено"
          value="Очередь восстановления, ошибки и ручной повтор отправки"
          onPress={() => router.push("/settings/sync-queue" as never)}
        />
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Дополнительно</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>Сервер, технические логи и диагностика для настройки и поддержки.</Text>
        <SettingsRow label="Адрес сервера" value="Проверка подключения и локальный HTTP для пилота" onPress={() => router.push("/(auth)/server-settings")} />
        <Text style={[styles.title, { color: colors.text }]}>Диагностика</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Автоматический отчёт об ошибках, ручная отправка логов и безопасная проверка канала диагностики.
        </Text>
        <SettingsRow
          label="Ошибки и логи"
          value="Автоотправка, ручной отчёт и тест диагностики"
          onPress={() => router.push("/settings/diagnostics" as never)}
        />
      </Card>

    </Screen>
  );
}

function SettingsRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border },
        pressed ? { backgroundColor: colors.background } : null
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>{value}</Text>
      </View>
      <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
    </Pressable>
  );
}

function themeLabel(preference: string) {
  if (preference === "dark") {
    return "тёмная";
  }

  if (preference === "light") {
    return "светлая";
  }

  return "как в системе";
}

const styles = StyleSheet.create({
  chevron: {
    fontSize: 28,
    lineHeight: 28
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  row: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "600"
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  title: {
    fontSize: 18,
    fontWeight: "600"
  }
});
