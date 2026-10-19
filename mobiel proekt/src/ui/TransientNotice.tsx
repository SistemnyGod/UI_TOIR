import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/features/settings/themePreference";

/** A non-modal notice. Its host reserves space above the form, never over an input. */
export function TransientNotice({ message }: { message: string | null }) {
  return message ? <Notice key={message} message={message} /> : null;
}

function Notice({ message }: { message: string }) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <View pointerEvents="box-none" style={styles.host}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${message}. Закрыть уведомление`}
      accessibilityLiveRegion="polite" onPress={() => setVisible(false)}
      style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
      <Ionicons name="close" size={16} color={colors.mutedText} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  host: { alignItems: "flex-end" },
  notice: { maxWidth: 320, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  text: { flexShrink: 1, fontSize: 14, lineHeight: 20 }
});
