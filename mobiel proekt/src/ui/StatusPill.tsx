import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/features/settings/themePreference";
import { toneColors } from "./atomTheme";
import { font } from "./typography";
import { StyleSheet, Text, View } from "react-native";

type StatusPillProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const { colors: theme } = useAppTheme();
  const palette = toneColors(theme, tone);
  const colors = { backgroundColor: palette.background, borderColor: palette.background, color: palette.foreground };
  const icons = { neutral: "information-circle-outline", success: "checkmark-circle-outline", warning: "time-outline", danger: "alert-circle-outline" } as const;

  return (
    <View style={[styles.pill, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
      <Ionicons name={icons[tone]} size={15} color={colors.color} />
      <Text style={[styles.label, font(800), { color: colors.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  dot: {
    borderRadius: 999,
    height: 6,
    width: 6
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18
  }
});
