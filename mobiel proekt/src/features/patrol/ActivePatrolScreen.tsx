import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { AutoSubmitCountdown } from "@/features/patrol/AutoSubmitCountdown";
import { ActivePatrolPlaceholder } from "@/features/patrol/activePatrol/ActivePatrolPlaceholder";
import { ActivePatrolProgressCard } from "@/features/patrol/activePatrol/ActivePatrolProgressCard";
import { ActivePatrolSecondaryBar } from "@/features/patrol/activePatrol/ActivePatrolSecondaryBar";
import { ActivePatrolStatusBanners } from "@/features/patrol/activePatrol/ActivePatrolStatusBanners";
import { describeActivePatrol, primaryPatrolAction } from "@/features/patrol/activePatrol/activePatrolPresentation";
import { useActivePatrol } from "@/features/patrol/activePatrol/useActivePatrol";
import { buildPatrolActionMenu } from "@/features/patrol/patrolActionMenu";
import { useAppTheme } from "@/features/settings/themePreference";
import { ActionSheet } from "@/ui/ActionSheet";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

export function ActivePatrolScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  return <ActivePatrolContent key={assignmentId} assignmentId={assignmentId} />;
}

function ActivePatrolContent({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const patrol = useActivePatrol(assignmentId);
  const { assignment, progress, scanPolicy, isActing } = patrol;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (patrol.isLoading && !assignment) {
    return <ActivePatrolPlaceholder kind="loading" />;
  }
  if (patrol.loadError && !assignment) {
    return <ActivePatrolPlaceholder kind="error" message={patrol.loadError} onRetry={() => void patrol.reload()} />;
  }
  if (!assignment || !progress) {
    return <ActivePatrolPlaceholder kind="notFound" onBack={() => router.replace("/patrol/request-board")} />;
  }

  const view = describeActivePatrol(assignment.status, progress);
  const primaryAction = primaryPatrolAction(assignment.assignmentId, progress, scanPolicy.nfcEnabled);
  const assignmentPath = `/patrol/assignment/${assignment.assignmentId}`;

  return (
    <Screen
      title={assignment.routeName}
      subtitle="Следуйте следующему действию — прогресс сохраняется автоматически."
      bottomAction={view.isInProgress ? (
        <PrimaryButton
          testID="patrol-primary-action"
          disabled={isActing || progress.total === 0}
          icon={primaryAction.icon}
          label={primaryAction.label}
          onPress={() => router.push(primaryAction.path as never)}
          size="large"
        />
      ) : null}
    >
      <ActivePatrolProgressCard assignment={assignment} progress={progress} />

      {view.isInProgress ? <AutoSubmitCountdown assignmentId={assignment.assignmentId} /> : null}
      {patrol.error ? <Text style={[styles.error, { color: colors.danger }]}>{patrol.error}</Text> : null}

      <ActivePatrolStatusBanners view={view} />

      {view.isAccepted || view.isPaused ? (
        <PrimaryButton
          testID="patrol-start"
          disabled={isActing || progress.total === 0}
          icon="play-outline"
          label={view.isPaused ? "Продолжить обход" : "Начать обход"}
          onPress={() => patrol.startPatrol(assignment, path => router.replace(path as never))}
          size="large"
        />
      ) : null}
      {view.isCompletedLocal ? <PrimaryButton disabled={isActing} icon="refresh-outline" label="Повторить отправку" onPress={patrol.retrySubmit} size="large" /> : null}
      {view.isBlocked ? <PrimaryButton icon="cloud-upload-outline" label="Открыть очередь" onPress={() => router.push("/settings/sync-queue" as never)} size="large" /> : null}
      {view.isCompletedServer ? <PrimaryButton icon="checkmark-circle-outline" label="К новым заявкам" onPress={() => router.replace("/patrol/request-board")} size="large" /> : null}

      <ActivePatrolSecondaryBar
        view={view}
        onOpenPoints={() => router.push(`${assignmentPath}/all-points` as never)}
        onReviewReport={() => router.push(`${assignmentPath}/submit` as never)}
        onOpenMenu={() => setIsMenuOpen(true)}
      />
      <ActionSheet
        actions={buildPatrolActionMenu({
          assignmentId: assignment.assignmentId,
          status: assignment.status,
          onQr: scanPolicy.qrFallbackEnabled ? () => router.push(`${assignmentPath}/scan-qr` as never) : undefined,
          onPause: view.isInProgress ? patrol.pausePatrol : undefined,
          onSwitch: () => router.push(`${assignmentPath}/switch` as never),
          onPoints: () => router.push(`${assignmentPath}/all-points` as never),
          onSubmit: () => router.push(`${assignmentPath}/submit` as never),
          onAppeal: () => router.push(`${assignmentPath}/appeal` as never),
          onCancel: () => router.push(`${assignmentPath}/appeal?kind=cancel` as never)
        })}
        onClose={() => setIsMenuOpen(false)}
        title="Действия с обходом"
        visible={isMenuOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    fontSize: 14,
    lineHeight: 20
  }
});
