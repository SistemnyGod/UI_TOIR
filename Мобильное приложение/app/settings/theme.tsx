import { StyleSheet, Text, View } from "react-native";

import { ThemePreference, useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

const options: { label: string; subtitle: string; value: ThemePreference }[] = [
  { label: "Как в системе", subtitle: "Приложение повторяет настройку Android.", value: "system" },
  { label: "Светлая", subtitle: "Светлый фон для дневной работы.", value: "light" },
  { label: "Темная", subtitle: "Темный фон для слабого освещения.", value: "dark" }
];

export default function ThemeRoute() {
  const { colors, effectiveScheme, preference, setPreference } = useAppTheme();

  return (
    <Screen title="Тема" subtitle="Выберите оформление приложения. Настройка сохраняется на телефоне.">
      <Card>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Текущий режим</Text>
          <StatusPill label={effectiveScheme === "dark" ? "Темная" : "Светлая"} tone="neutral" />
        </View>
      </Card>

      {options.map((option) => (
        <Card key={option.value}>
          <View style={styles.optionHeader}>
            <View style={styles.optionText}>
              <Text style={[styles.title, { color: colors.text }]}>{option.label}</Text>
              <Text style={[styles.text, { color: colors.mutedText }]}>{option.subtitle}</Text>
            </View>
            {preference === option.value ? <StatusPill label="Выбрано" tone="success" /> : null}
          </View>
          <PrimaryButton
            label={preference === option.value ? "Используется" : "Выбрать"}
            onPress={() => {
              void setPreference(option.value);
            }}
            disabled={preference === option.value}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  optionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  optionText: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 18,
    fontWeight: "600"
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  }
});
