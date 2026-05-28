import { StyleSheet, Text, View } from "react-native";

type StatusPillProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const tones = {
  neutral: { backgroundColor: "#f3f6fb", borderColor: "#e4eaf3", color: "#6b7280" },
  success: { backgroundColor: "#eafaf1", borderColor: "#c9f1db", color: "#22c55e" },
  warning: { backgroundColor: "#fff7ed", borderColor: "#fed7aa", color: "#f59e0b" },
  danger: { backgroundColor: "#fff1f1", borderColor: "#fecaca", color: "#ef4444" }
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const colors = tones[tone];

  return (
    <View style={[styles.pill, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
      <Text style={[styles.label, { color: colors.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  label: {
    fontSize: 12,
    fontWeight: "600"
  }
});
