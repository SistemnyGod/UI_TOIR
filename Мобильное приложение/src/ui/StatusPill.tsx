import { StyleSheet, Text, View } from "react-native";

type StatusPillProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const tones = {
  neutral: { backgroundColor: "#f3f6fb", borderColor: "#e4eaf3", color: "#687280" },
  success: { backgroundColor: "#eafaf1", borderColor: "#c9f1db", color: "#22c55e" },
  warning: { backgroundColor: "#fff7ed", borderColor: "#fed7aa", color: "#f59e0b" },
  danger: { backgroundColor: "#fff1f1", borderColor: "#fecaca", color: "#ef4444" }
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const colors = tones[tone];

  return (
    <View style={[styles.pill, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
      <View style={[styles.dot, { backgroundColor: colors.color }]} />
      <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.label, { color: colors.color }]}>{label}</Text>
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
    paddingVertical: 5
  },
  dot: {
    borderRadius: 999,
    height: 6,
    width: 6
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  }
});
