import { StyleSheet, Text, View } from "react-native";

import type { ActiveAssignment, AssignmentProgress } from "@/db/repositories/patrolRepository";
import {
  assignmentStatusLabel,
  assignmentStatusTone,
  formatDateTime,
  nextStepText,
  progressPercent
} from "@/features/patrol/activePatrol/activePatrolPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { StatusPill } from "@/ui/StatusPill";

/** Route header, status, progress bar and the next step of the current patrol. */
export function ActivePatrolProgressCard({ assignment, progress }: { assignment: ActiveAssignment; progress: AssignmentProgress }) {
  const { colors } = useAppTheme();
  const percent = progressPercent(progress);
  return (
    <Card>
      <View style={styles.routeHeader}>
        <View style={styles.routeTextBox}>
          <Text style={[styles.employeeLine, { color: colors.mutedText }]}>Текущий обход</Text>
          <Text style={[styles.routeTitle, { color: colors.text }]}>{assignment.routeName}</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Начат: {formatDateTime(assignment.startedAtLocal)}</Text>
        </View>
        <StatusPill label={assignmentStatusLabel(assignment.status)} tone={assignmentStatusTone(assignment.status)} />
      </View>

      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.text }]}>Прогресс</Text>
        <Text style={[styles.progressLabel, { color: colors.text }]}>{progress.total === 0 ? "Загружаем точки маршрута" : `${progress.completed} из ${progress.total}`}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.success, width: `${percent}%` }]} />
      </View>
      <Text style={[styles.percentText, { color: colors.mutedText }]}>{percent}%</Text>
      <View style={[styles.nextStepBox, { backgroundColor: colors.backgroundAccent }]}>
        <Text style={[styles.nextStepLabel, { color: colors.primary }]}>Следующий шаг</Text>
        <Text style={[styles.nextStepText, { color: colors.text }]}>{nextStepText(assignment.status, progress)}</Text>
      </View>
      {progress.deferred > 0 || progress.issues > 0 || progress.skipped > 0 ? (
        <Text style={[styles.percentText, { color: colors.mutedText }]}>Отложено: {progress.deferred}. Неисправно: {progress.issues}. Не осмотрено: {progress.skipped}.</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  routeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  routeTextBox: {
    flex: 1,
    gap: 4
  },
  employeeLine: {
    fontSize: 13,
    fontFamily: "Manrope_800ExtraBold"
  },
  routeTitle: {
    fontSize: 21,
    fontFamily: "Manrope_800ExtraBold",
    lineHeight: 27
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  progressFill: {
    borderRadius: 999,
    height: "100%"
  },
  percentText: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold"
  },
  nextStepBox: {
    borderRadius: 14,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  nextStepLabel: {
    fontSize: 11,
    fontFamily: "Manrope_800ExtraBold",
    textTransform: "uppercase"
  },
  nextStepText: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
    lineHeight: 19
  }
});
