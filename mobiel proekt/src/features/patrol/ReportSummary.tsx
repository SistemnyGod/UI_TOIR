import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { GradientFill } from "@/ui/GradientFill";
import { RingChart } from "@/ui/RingChart";
import { font } from "@/ui/typography";

export type ReportSummaryProgress = { total: number; inspected: number; issues: number; skipped: number; deferred: number };

/** Donut of point results with a legend, as on the report check mockup. Unfilled points stay as the track. */
export function ReportSummaryDonut({ progress }: { progress: ReportSummaryProgress }) {
  const { colors } = useAppTheme();
  const ok = Math.max(0, progress.inspected - progress.issues);
  const legend = [
    { label: "Исправно", value: ok, color: colors.success },
    { label: "Замечания", value: progress.issues, color: colors.danger },
    { label: "Не осмотрено", value: progress.skipped, color: colors.warning },
    { label: "Отложено", value: progress.deferred, color: colors.primary }
  ];
  return <View accessible accessibilityLabel={`Точек: ${progress.total}. ${legend.map(item => `${item.label}: ${item.value}`).join(". ")}`} style={styles.summary}>
    <RingChart size={84} stroke={10} track={colors.track} total={Math.max(progress.total, 1)} segments={legend}>
      <Text style={[font(800), styles.total, { color: colors.text }]}>{progress.total}</Text>
      <Text style={[font(700), styles.totalCaption, { color: colors.mutedText }]}>точек</Text>
    </RingChart>
    <View style={styles.legend}>
      {legend.map(item => <View key={item.label} style={styles.legendItem}>
        <View style={styles.legendLabelRow}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text numberOfLines={1} style={[font(700), styles.legendLabel, { color: colors.mutedText }]}>{item.label}</Text>
        </View>
        <Text style={[font(800), styles.legendValue, { color: colors.text }]}>{item.value}</Text>
      </View>)}
    </View>
  </View>;
}

/** Illustrated state for a report the server stopped or rejected; the copy comes from the delivery presentation. */
export function ReportRejectedState({ title, detail }: { title: string; detail: string | null }) {
  const { colors } = useAppTheme();
  return <View accessibilityLiveRegion="polite" style={styles.rejected}>
    <View style={[styles.halo, { backgroundColor: colors.dangerSurface }]}>
      <View style={[styles.rejectTile, { backgroundColor: colors.dangerFill, shadowColor: colors.dangerFill }]}>
        <GradientFill colors={colors} kind="danger" radius={26} />
        <Ionicons color="#ffffff" name="document-text-outline" size={38} />
      </View>
      <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Ionicons color={colors.danger} name="close" size={16} />
      </View>
    </View>
    <Text accessibilityRole="header" style={[font(800), styles.rejectTitle, { color: colors.text }]}>{title}</Text>
    {detail ? <Text style={[font(600), styles.rejectDetail, { color: colors.mutedText }]}>{detail}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  summary: { alignItems: "center", flexDirection: "row", gap: 16 },
  total: { fontSize: 22, lineHeight: 24 },
  totalCaption: { fontSize: 10, lineHeight: 12 },
  legend: { flex: 1, flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  legendItem: { gap: 2, width: "50%", paddingRight: 6 },
  legendLabelRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  swatch: { borderRadius: 3, height: 8, width: 8 },
  legendLabel: { flexShrink: 1, fontSize: 11, lineHeight: 14 },
  legendValue: { fontSize: 20, lineHeight: 24, paddingLeft: 14 },
  rejected: { alignItems: "center", gap: 8, paddingVertical: 6 },
  halo: { alignItems: "center", borderRadius: 66, height: 120, justifyContent: "center", marginBottom: 4, width: 120 },
  rejectTile: { alignItems: "center", borderRadius: 26, elevation: 8, height: 78, justifyContent: "center", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 18,
    transform: [{ rotate: "-6deg" }], width: 78 },
  badge: { alignItems: "center", borderRadius: 15, borderWidth: 1, height: 30, justifyContent: "center", position: "absolute", right: 4, top: 8, width: 30 },
  rejectTitle: { fontSize: 21, letterSpacing: -0.4, lineHeight: 27, textAlign: "center" },
  rejectDetail: { fontSize: 14, lineHeight: 20, maxWidth: 320, textAlign: "center" }
});
