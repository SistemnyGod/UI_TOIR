import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { toneColors } from "@/ui/atomTheme";
import { attachmentSummary, type ReportPreviewRow } from "./reportPreviewPresentation";

/** Every point as it goes into the report. Points with missing data are highlighted and open on tap. */
export function ReportPreviewCard({ rows, attentionCount, onOpenPoint }: {
  rows: ReportPreviewRow[];
  attentionCount: number;
  onOpenPoint: (row: ReportPreviewRow) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Состав отчёта</Text>
        <Text style={[styles.meta, { color: attentionCount > 0 ? colors.danger : colors.faintText }]}>
          {attentionCount > 0 ? `Требуют внимания: ${attentionCount}` : `Точек: ${rows.length}`}
        </Text>
      </View>
      <View style={styles.list}>
        {rows.map((row, index) => <PreviewRow key={row.pointId} row={row} last={index === rows.length - 1} onPress={() => onOpenPoint(row)} />)}
      </View>
    </Card>
  );
}

const confirmationIcons = { NFC: "radio-outline", QR: "qr-code-outline", "Вручную": "hand-left-outline" } as const;

function PreviewRow({ row, onPress, last }: { row: ReportPreviewRow; onPress: () => void; last: boolean }) {
  const { colors } = useAppTheme();
  const attention = row.problems.length > 0;
  const details = [row.confirmationLabel, attachmentSummary(row)].join(" · ");
  const tone = toneColors(colors, attention ? "danger" : row.resultTone);
  const icon = attention || row.resultTone === "danger" ? "alert" : row.resultTone === "success" ? "checkmark" : row.resultTone === "warning" ? "time-outline" : "ellipse-outline";
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={[`${row.orderIndex}. ${row.name}`, row.resultLabel, details, row.commentExcerpt, ...row.problems].filter(Boolean).join(". ")}
      accessibilityHint={attention ? "Открыть точку и заполнить недостающие данные" : "Открыть точку"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, {
        backgroundColor: attention ? colors.dangerSurface : "transparent",
        borderBottomColor: last ? "transparent" : colors.border,
        opacity: pressed ? 0.72 : 1
      }, attention ? styles.attentionRow : null]}>
      <View style={[styles.statusIcon, { backgroundColor: tone.background }]}>
        <Ionicons name={icon} size={15} color={tone.foreground} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={[styles.name, { color: colors.text }]}>{row.orderIndex}. {row.name}</Text>
          <Text style={[styles.resultLabel, { color: tone.foreground }]}>{row.resultLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name={confirmationIcons[row.confirmationLabel as keyof typeof confirmationIcons] ?? "help-circle-outline"} size={13} color={colors.faintText} />
          <Text style={[styles.meta, { color: colors.faintText }]}>{details}</Text>
        </View>
        {row.commentExcerpt ? <Text style={[styles.comment, { color: colors.text, backgroundColor: colors.backgroundAccent, borderLeftColor: tone.foreground }]}>«{row.commentExcerpt}»</Text> : null}
        {row.problems.map(problem => (
          <View key={problem} style={styles.problem}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[styles.problemText, { color: colors.danger }]}>{problem}</Text>
          </View>
        ))}
        {attention ? <View style={styles.jump}>
          <Text style={[styles.jumpText, { color: colors.primary }]}>Перейти к точке</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: "Manrope_800ExtraBold" },
  list: { marginTop: -4 },
  row: { flexDirection: "row", gap: 12, minHeight: 56, paddingVertical: 10, borderBottomWidth: 1 },
  attentionRow: { borderRadius: 14, paddingHorizontal: 10, marginVertical: 4, borderBottomWidth: 0 },
  statusIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 1 },
  rowBody: { flex: 1, gap: 3, minWidth: 0 },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: "Manrope_800ExtraBold" },
  resultLabel: { fontSize: 12, lineHeight: 20, fontFamily: "Manrope_800ExtraBold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontFamily: "Manrope_600SemiBold" },
  comment: { marginTop: 3, fontSize: 13, lineHeight: 19, fontFamily: "Manrope_600SemiBold", borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: "hidden" },
  problem: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  problemText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: "Manrope_600SemiBold" },
  jump: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", minHeight: 32 },
  jumpText: { fontSize: 14, fontFamily: "Manrope_800ExtraBold" }
});
