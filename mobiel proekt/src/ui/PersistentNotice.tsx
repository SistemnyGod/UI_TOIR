import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

/**
 * An error that stays until the employee dismisses it or the failed action
 * succeeds. Unlike TransientNotice it never disappears on a timer, so a save
 * failure cannot be missed while the guard is looking at the equipment.
 */
export function PersistentNotice({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="assertive"
    style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
    <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Скрыть сообщение об ошибке" hitSlop={8} onPress={onDismiss} style={styles.close}>
      <Ionicons name="close" size={20} color={colors.danger} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  text: { flex: 1, fontSize: 16, lineHeight: 24 },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -10, marginRight: -10 }
});
