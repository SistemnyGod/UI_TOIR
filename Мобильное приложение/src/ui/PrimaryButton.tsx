import { Pressable, StyleSheet, Text } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function PrimaryButton({ label, onPress, disabled, variant = "primary" }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
        variant === "secondary" ? { backgroundColor: "transparent", borderColor: colors.primary } : null,
        variant === "ghost" ? { backgroundColor: "transparent", borderColor: colors.border } : null,
        isDanger ? { backgroundColor: "transparent", borderColor: "#ef4444" } : null,
        disabled ? styles.disabled : null,
        pressed && !disabled && isPrimary ? [styles.pressed, { backgroundColor: colors.primaryPressed }] : null,
        pressed && !disabled && !isPrimary ? styles.outlinePressed : null
      ]}
    >
      <Text
        style={[
          styles.label,
          isPrimary ? styles.primaryLabel : null,
          variant === "secondary" || variant === "ghost" ? { color: colors.primary } : null,
          isDanger ? styles.dangerLabel : null,
          disabled ? styles.disabledLabel : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#1e5bff",
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12
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
    fontSize: 16,
    fontWeight: "700"
  },
  primaryLabel: {
    color: "#ffffff",
  },
  dangerLabel: {
    color: "#ef4444"
  },
  disabledLabel: {
    color: "#ffffff"
  }
});
