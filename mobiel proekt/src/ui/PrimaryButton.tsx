import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "normal" | "large";
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function PrimaryButton({ label, onPress, disabled, disabledReason, loading = false, icon, size = "normal", variant = "primary" }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const blocked = disabled || loading;
  const labelColor = blocked ? colors.disabledText : isPrimary ? colors.onPrimary : isDanger ? colors.danger : colors.primary;

  return (
    <View style={{ gap: 6, minWidth: 0 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      accessibilityHint={disabled ? disabledReason : undefined}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "large" ? styles.largeButton : null,
        isPrimary ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
        variant === "secondary" ? { backgroundColor: "transparent", borderColor: colors.primary } : null,
        variant === "ghost" ? { backgroundColor: "transparent", borderColor: colors.border } : null,
        isDanger ? { backgroundColor: "transparent", borderColor: colors.danger } : null,
        blocked ? { backgroundColor: colors.disabled, borderColor: colors.disabled } : null,
        pressed && !blocked && isPrimary ? [styles.pressed, { backgroundColor: colors.primaryPressed }] : null,
        pressed && !blocked && !isPrimary ? styles.outlinePressed : null
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={labelColor} /> : icon ? <Ionicons color={labelColor} name={icon} size={size === "large" ? 22 : 18} /> : null}
        <Text
          style={[
            styles.label,
            size === "large" ? styles.largeLabel : null,
            { color: labelColor }
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
    {disabled && disabledReason ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: colors.mutedText }}>{disabledReason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#1e5bff",
    minWidth: 0,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 15,
    paddingVertical: 12
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    maxWidth: "100%"
  },
  largeButton: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  largeLabel: {
    fontSize: 17,
    lineHeight: 21
  },
  disabled: {
    backgroundColor: "#d8dee8",
    borderColor: "#d8dee8"
  },
  pressed: {
    opacity: 0.86
  },
  outlinePressed: {
    opacity: 0.72
  },
  label: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    textAlign: "center"
  },
  disabledLabel: {
    color: "#ffffff"
  }
});
