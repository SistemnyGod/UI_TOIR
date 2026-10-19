import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { softShadow } from "@/ui/typography";

export function ProfileGroup({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[{ borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card, borderRadius: 22, overflow: "hidden" }, softShadow(colors.shadow, 1)]}>{children}</View>;
}
export function ProfileRow({ title, detail, icon, onPress, last, danger, trailing, leading, disabled, detailLines }: {
  title: string; detail?: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; last?: boolean; danger?: boolean; trailing?: ReactNode; leading?: ReactNode; disabled?: boolean; detailLines?: number;
}) {
  const { colors } = useAppTheme();
  const content = <>
    {leading ?? (icon ? <View style={[profileStyles.tile, { backgroundColor: danger ? colors.dangerSurface : colors.tile }]}><Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} /></View> : null)}
    <View style={{ flex: 1, gap: 4 }}><Text style={[profileStyles.label, { color: danger ? colors.danger : colors.text }]}>{title}</Text>{detail ? <Text numberOfLines={detailLines} style={[profileStyles.detail, { color: colors.mutedText }]}>{detail}</Text> : null}</View>
    {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faintText} /> : null)}
  </>;
  const style = [profileStyles.row, { borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: colors.cardBorder }];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed || disabled ? 0.6 : 1 }]}>{content}</Pressable> : <View style={style}>{content}</View>;
}
export const profileStyles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, marginHorizontal: 14 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, lineHeight: 22, fontFamily: "Manrope_800ExtraBold" },
  detail: { fontSize: 14, lineHeight: 20 },
});
