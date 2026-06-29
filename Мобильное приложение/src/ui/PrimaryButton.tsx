import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "normal" | "large";
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function PrimaryButton({ label, onPress, disabled, icon, size = "normal", variant = "primary" }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const labelColor = isPrimary ? "#ffffff" : isDanger ? "#ef4444" : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "large" ? styles.largeButton : null,
        isPrimary ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
        variant === "secondary" ? { backgroundColor: "transparent", borderColor: colors.primary } : null,
        variant === "ghost" ? { backgroundColor: "transparent", borderColor: colors.border } : null,
        isDanger ? { backgroundColor: "transparent", borderColor: "#ef4444" } : null,
        disabled ? styles.disabled : null,
        pressed && !disabled && isPrimary ? [styles.pressed, { backgroundColor: colors.primaryPressed }] : null,
        pressed && !disabled && !isPrimary ? styles.outlinePressed : null
      ]}
    >
      <View style={styles.content}>
        {icon ? <Ionicons color={disabled ? "#ffffff" : labelColor} name={icon} size={size === "large" ? 22 : 18} /> : null}
        <Text
          ellipsizeMode="tail"
          numberOfLines={2}
          style={[
            styles.label,
            size === "large" ? styles.largeLabel : null,
            { color: labelColor },
            disabled ? styles.disabledLabel : null
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#1e5bff",
    minWidth: 0,
    minHeight: 48,
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
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  disabledLabel: {
    color: "#ffffff"
  }
});
