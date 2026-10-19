import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { font, softShadow } from "@/ui/typography";

export function ScanActionBar({ onPoints, onManual, onMore }: {
  onPoints: () => void;
  onManual?: () => void;
  onMore: () => void;
}) {
  const { colors } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 350;
  const buttonStyle = [{ backgroundColor: colors.card, borderColor: colors.cardBorder }, softShadow(colors.shadow, 1)];
  return <View style={styles.bar}>
    <View style={[styles.actions, stacked && styles.stacked]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Все метки" onPress={onPoints} style={[styles.action, stacked ? { flex: 0, flexBasis: "auto", flexShrink: 0 } : null, buttonStyle]}>
        <View style={[styles.tile, { backgroundColor: colors.tile }]}><Ionicons name="list-outline" size={18} color={colors.primary} /></View>
        <Text style={[styles.label, font(800), { color: colors.text }]}>Все метки</Text>
      </Pressable>
      {onManual ? <Pressable accessibilityRole="button" accessibilityLabel="Метка недоступна" onPress={onManual} style={[styles.action, stacked ? { flex: 0, flexBasis: "auto", flexShrink: 0 } : null, buttonStyle]}>
        <View style={[styles.tile, { backgroundColor: colors.warningSurface }]}><Ionicons name="warning-outline" size={18} color={colors.warning} /></View>
        <Text style={[styles.label, font(800), { color: colors.text }]}>Метка недоступна</Text>
      </Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Ещё: действия с обходом" onPress={onMore} style={[styles.more, buttonStyle]}>
      <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  actions: { flex: 1, flexDirection: "row", alignItems: "stretch", gap: 8 },
  stacked: { flexDirection: "column" },
  action: { flex: 1, minHeight: 60, borderWidth: 1, borderRadius: 18, paddingHorizontal: 8, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 19, textAlign: "center" },
  more: { width: 52, height: 60, alignSelf: "flex-end", borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center" }
});
