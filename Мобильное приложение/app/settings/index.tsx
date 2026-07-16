import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export default function SettingsRoute() {
  const router = useRouter();
  const { colors, effectiveScheme, preference } = useAppTheme();

  return (
    <Screen title="Настройки" subtitle="Персонализация, аккаунт, сервер, диагностика и восстановление отправки.">
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

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Сервер</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Адрес backend API для входа, загрузки заявок, отправки отчётов и файлов.
        </Text>
        <SettingsRow
          label="Адрес сервера"
          value="Проверка подключения и локальный HTTP для пилота"
          onPress={() => router.push("/(auth)/server-settings")}
        />
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Режим работы</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Приложение хранит обходы локально и отправляет отчёт автоматически после появления интернета.
        </Text>
        <View style={styles.pills}>
          <StatusPill label="Offline-first" tone="success" />
          <StatusPill label="NFC" tone="success" />
          <StatusPill label="Фото и видео" tone="neutral" />
        </View>
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
