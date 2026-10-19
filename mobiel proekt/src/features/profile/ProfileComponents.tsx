import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";

export function ProfileGroup({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, overflow: "hidden" }}>{children}</View>;
}
export function ProfileRow({ title, detail, icon, onPress, last, danger, trailing, leading, disabled, detailLines }: {
  title: string; detail?: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; last?: boolean; danger?: boolean; trailing?: ReactNode; leading?: ReactNode; disabled?: boolean; detailLines?: number;
}) {
  const { colors } = useAppTheme();
  const content = <>
    {leading ?? (icon ? <Ionicons name={icon} size={24} color={danger ? colors.danger : colors.primary} /> : null)}
    <View style={{ flex: 1, gap: 4 }}><Text style={[profileStyles.label, { color: danger ? colors.danger : colors.text }]}>{title}</Text>{detail ? <Text numberOfLines={detailLines} style={[profileStyles.detail, { color: colors.mutedText }]}>{detail}</Text> : null}</View>
    {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedText} /> : null)}
  </>;
  const style = [profileStyles.row, { borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border }];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed || disabled ? 0.6 : 1 }]}>{content}</Pressable> : <View style={style}>{content}</View>;
}
export const profileStyles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, marginHorizontal: 16 },
  label: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  detail: { fontSize: 14, lineHeight: 20 },
});
