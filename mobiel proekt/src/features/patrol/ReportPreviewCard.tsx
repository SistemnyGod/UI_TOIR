import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { StatusPill } from "@/ui/StatusPill";
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
        <Text style={[styles.meta, { color: attentionCount > 0 ? colors.danger : colors.mutedText }]}>
          {attentionCount > 0 ? `Требуют внимания: ${attentionCount}` : `Точек: ${rows.length}`}
        </Text>
      </View>
      {rows.map(row => <PreviewRow key={row.pointId} row={row} onPress={() => onOpenPoint(row)} />)}
    </Card>
  );
}

function PreviewRow({ row, onPress }: { row: ReportPreviewRow; onPress: () => void }) {
  const { colors } = useAppTheme();
  const attention = row.problems.length > 0;
  const details = [row.confirmationLabel, attachmentSummary(row)].join(" · ");
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={[`${row.orderIndex}. ${row.name}`, row.resultLabel, details, row.commentExcerpt, ...row.problems].filter(Boolean).join(". ")}
      accessibilityHint={attention ? "Открыть точку и заполнить недостающие данные" : "Открыть точку"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, {
        backgroundColor: attention ? colors.dangerSurface : colors.card,
        borderColor: attention ? colors.danger : colors.border,
        opacity: pressed ? 0.72 : 1
      }]}>
      <View style={styles.rowHeader}>
        <Text style={[styles.name, { color: colors.text }]}>{row.orderIndex}. {row.name}</Text>
        <StatusPill label={row.resultLabel} tone={row.resultTone} />
      </View>
      <Text style={[styles.meta, { color: colors.mutedText }]}>{details}</Text>
      {row.commentExcerpt ? <Text style={[styles.comment, { color: colors.text }]}>«{row.commentExcerpt}»</Text> : null}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: "800" },
  row: { borderRadius: 12, borderWidth: 1, gap: 6, minHeight: 56, padding: 12 },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  meta: { fontSize: 14, lineHeight: 20 },
  comment: { fontSize: 14, lineHeight: 20 },
  problem: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  problemText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  jump: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", minHeight: 32 },
  jumpText: { fontSize: 14, fontWeight: "800" }
});
