import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { GradientFill } from "@/ui/GradientFill";
import { font, softShadow } from "@/ui/typography";

type PrimaryButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "normal" | "large";
  variant?: "primary" | "secondary" | "danger" | "ghost" | "inverse";
  /** Stable e2e selector (Maestro `id:`); see e2e/README.md. */
  testID?: string;
};

export function PrimaryButton({ label, onPress, disabled, disabledReason, loading = false, icon, size = "normal", variant = "primary", testID }: PrimaryButtonProps) {
  const { colors } = useAppTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const blocked = disabled || loading;
  const labelColor = blocked ? colors.disabledText : variant === "inverse" ? colors.accent : isPrimary ? colors.onAccent : isDanger ? colors.danger : variant === "ghost" ? colors.text : colors.primary;

  return (
    <View style={{ gap: 6, minWidth: 0 }}>
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      accessibilityHint={disabled ? disabledReason : undefined}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "large" ? styles.largeButton : null,
        isPrimary ? [{ backgroundColor: colors.accent, borderColor: colors.accent }, blocked ? null : { shadowColor: colors.accent, shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }] : null,
        variant === "secondary" ? { backgroundColor: colors.backgroundAccent, borderColor: colors.backgroundAccent } : null,
        variant === "ghost" ? [{ backgroundColor: colors.card, borderColor: colors.cardBorder }, softShadow(colors.shadow, 1)] : null,
        isDanger ? { backgroundColor: colors.dangerSurface, borderColor: colors.dangerSurface } : null,
        variant === "inverse" ? { backgroundColor: "#ffffff", borderColor: "#ffffff", shadowColor: "#06143c", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 } : null,
        blocked ? { backgroundColor: colors.disabled, borderColor: colors.disabled } : null,
        pressed && !blocked && isPrimary ? [styles.pressed, { backgroundColor: colors.accentPressed }] : null,
        pressed && !blocked && !isPrimary ? styles.outlinePressed : null
      ]}
    >
      {isPrimary && !blocked ? <GradientFill colors={colors} kind="accent" radius={size === "large" ? 18 : 16} style={styles.gradient} /> : null}
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={labelColor} /> : icon ? <Ionicons color={labelColor} name={icon} size={size === "large" ? 22 : 18} /> : null}
        <Text
          style={[
            styles.label,
            font(800),
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
    borderRadius: 16,
    backgroundColor: "#1e5bff",
    minWidth: 0,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 15,
    paddingVertical: 12
  },
  /** Covers the 1px border too, so the fill reaches the rounded edge. */
  gradient: {
    left: -1,
    top: -1,
    right: -1,
    bottom: -1
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    maxWidth: "100%"
  },
  largeButton: {
    borderRadius: 18,
    minHeight: 60,
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
    transform: [{ scale: 0.97 }]
  },
  outlinePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }]
  },
  label: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  disabledLabel: {
    color: "#ffffff"
  }
});
