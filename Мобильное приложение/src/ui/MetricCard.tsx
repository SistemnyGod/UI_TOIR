import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

type MetricTone = "neutral" | "success" | "warning" | "danger" | "primary";

type MetricCardProps = {
  label: string;
  style?: StyleProp<ViewStyle>;
  value: number | string;
  tone?: MetricTone;
};

export function MetricCard({ label, style, value, tone = "neutral" }: MetricCardProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.value, { color: colors.text }, toneStyle(tone)]}>{value}</Text>
      <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.label, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function toneStyle(tone: MetricTone) {
  switch (tone) {
    case "success":
      return styles.success;
    case "warning":
      return styles.warning;
    case "danger":
      return styles.danger;
    case "primary":
      return styles.primary;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: "#0f1a2b",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1
  },
  value: {
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 25
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    flexShrink: 1
  },
  primary: {
    color: "#1e5bff"
  },
  success: {
    color: "#22c55e"
  },
  warning: {
    color: "#f59e0b"
  },
  danger: {
    color: "#ef4444"
  }
});
