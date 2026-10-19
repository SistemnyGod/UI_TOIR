import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReportDeliveryStateSnapshot } from '@/domain/reporting/reportDeliveryState';
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { getPatrolReportState, isReportFullyDelivered } from '@/services/patrolNavigationService';
import { getReportDeliveryState } from '@/db/repositories/outboxRepository';
import { clearCurrentPatrolIfMatches, getPatrolDeviceContext } from '@/db/repositories/patrolContextRepository';
import {
  getReportPreviewPoints,
  getReportReadiness,
  reopenInvalidCompletionReportLocally,
  ReportPreviewPoint,
  ReportReadiness
} from '@/db/repositories/patrolRepository';
import { getReportPrimaryAction } from '@/features/patrol/reportDeliveryPresentation';
import { groupReportProblems, ReportProblemGroup } from '@/features/patrol/reportReadinessPresentation';
import { useAppTheme } from '@/features/settings/themePreference';
import { logMobileError } from '@/services/mobileErrorReporter';
import { shouldReloadReportAfterSync, subscribeToSyncEvents } from '@/sync/syncEvents';
import { requestPatrolSync } from '@/sync/PatrolSyncCoordinator';
import { queuePatrolReport } from '@/features/patrol/reportSubmissionCoordinator';
import { ReportSendDialog } from '@/features/patrol/ReportSendDialog';
import { ReportPreviewCard } from '@/features/patrol/ReportPreviewCard';
import { AutoSubmitCountdown } from '@/features/patrol/AutoSubmitCountdown';
import { buildReportPreview, type ReportPreviewRow } from '@/features/patrol/reportPreviewPresentation';
import { Card } from '@/ui/Card';
import { ActionSheet } from '@/ui/ActionSheet';
import { toneColors } from '@/ui/atomTheme';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { Screen } from '@/ui/Screen';
import { StatusMessage } from '@/ui/StatusMessage';

type DeliveryState = ReportDeliveryStateSnapshot | null;

export function SubmitReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId, mode } = useLocalSearchParams<{ assignmentId: string; mode?: string }>();
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  // null: the preview could not be read; the problem list below still shows what is missing.
  const [previewPoints, setPreviewPoints] = useState<ReportPreviewPoint[] | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [isReadinessNoticeOpen, setIsReadinessNoticeOpen] = useState(false);
  const openingNoticeChecked = useRef(false);
  const [awaitingAttachments, setAwaitingAttachments] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const focused = useRef(false);
  const loadVersion = useRef(0);
  const focusVersion = useRef(0);
  const primaryActionInFlight = useRef<object | null>(null);

  const reload = useCallback(async () => {
    if (!focused.current) return;
    const version = ++loadVersion.current;
    const isCurrent = () => focused.current && version === loadVersion.current;
    setLoadError(null);
    try {
      const scope = await captureDataOwnerContext();
      const [loadedReadiness, loadedDelivery, reportState, loadedPreview] = await Promise.all([
        getReportReadiness(assignmentId),
        getReportDeliveryState(scope.ownerUserId, assignmentId),
        getPatrolReportState(scope, assignmentId),
        loadReportPreview(assignmentId)
      ]);
      const reportDelivery = reportState.completedLocally ? loadedDelivery : null;
      const fullyDelivered = reportState.completedLocally && loadedDelivery.status === 'delivered' && await isReportFullyDelivered(scope, assignmentId);
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      setReadiness(loadedReadiness);
      setPreviewPoints(loadedPreview);
      setDelivery(reportDelivery?.status === 'delivered' && !fullyDelivered
        ? { ...reportDelivery, status: 'sending' }
        : reportDelivery);
      setAwaitingAttachments(reportState.completedLocally && loadedDelivery.status === 'delivered' && !fullyDelivered);
      if (!openingNoticeChecked.current) {
        openingNoticeChecked.current = true;
        const groups = groupReportProblems(loadedReadiness.problems);
        const openingAction = getReportPrimaryAction(reportDelivery, {
          ready: loadedReadiness.ready,
          hasPointProblems: groups.some(problem => problem.orderIndex > 0)
        });
        setIsReadinessNoticeOpen(mode !== 'history' && openingAction.action === 'openProblems');
      }
    } catch (error) {
      void logMobileError('report.screen.load.failed', error);
      if (isCurrent()) setLoadError(error instanceof Error ? error.message : 'Не удалось прочитать локальный отчёт');
    }
  }, [assignmentId, mode]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      focusVersion.current++;
      primaryActionInFlight.current = null;
      setReadiness(null);
      setPreviewPoints(null);
      setDelivery(null);
      setAwaitingAttachments(false);
      setIsSubmitting(false);
      setSendDialogOpen(false);
      setSyncNotice(null);
      setActionError(null);
      openingNoticeChecked.current = false;
      setIsReadinessNoticeOpen(false);
      void reload();
      return () => { focused.current = false; loadVersion.current++; focusVersion.current++; setIsReadinessNoticeOpen(false); setSendDialogOpen(false); };
    }, [reload])
  );

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
      if (shouldReloadReportAfterSync(event, assignmentId)) {
        void reload();
      }
    }), [assignmentId, reload]));

  const problemGroups = useMemo(
    () => groupReportProblems(readiness?.problems ?? []),
    [readiness]
  );
  const preview = useMemo(
    () => previewPoints ? buildReportPreview(previewPoints, readiness?.problems ?? []) : null,
    [previewPoints, readiness]
  );
  const openPreviewPoint = (row: ReportPreviewRow) => {
    const editable = readiness?.assignment?.status === 'inProgress';
    router.push(`/patrol/assignment/${assignmentId}/point/${row.pointId}${editable && row.problems.length > 0 ? '/fill' : ''}`);
  };
  const sendBusy = isSubmitting && delivery?.status !== 'delivered';
  const primaryAction = getReportPrimaryAction(delivery, {
    ready: readiness?.ready ?? false,
    hasPointProblems: problemGroups.some(problem => problem.orderIndex > 0),
    pointProblemCount: problemGroups.filter(problem => problem.orderIndex > 0).length,
    awaitingAttachments
  }, sendBusy);
  const presentation = primaryAction;
  const stateColors = toneColors(colors, presentation.tone);
  const [showStatistics, setShowStatistics] = useState(false);

  async function runPrimaryAction() {
    if (!focused.current || primaryAction.disabled) return;
    if (primaryAction.action === 'done') {
      await leaveToRequestBoard();
      return;
    }
    if (primaryActionInFlight.current) return;
    const operation = {};
    const version = focusVersion.current;
    const isCurrent = () => focused.current && version === focusVersion.current;
    primaryActionInFlight.current = operation;
    setActionError(null);
    try { await handlePrimaryAction(isCurrent); } finally {
      if (primaryActionInFlight.current === operation) primaryActionInFlight.current = null;
      if (isCurrent()) setIsSubmitting(false);
    }
  }

  async function handlePrimaryAction(isCurrent: () => boolean) {
    if (isSubmitting) {
      return;
    }

    // Account and repair actions are meaningful even when the local readiness
    // snapshot is stale. Handle them before routing a user to points again.
    if (primaryAction.action === 'openProblems') {
      router.push(`/patrol/assignment/${assignmentId}/all-points?filter=attention`);
      return;
    }

    if (presentation.action === 'serverSettings') {
      router.push('/(auth)/server-settings');
      return;
    }

    if (presentation.action === 'signIn') {
      router.push('/(auth)/login');
      return;
    }

    if (presentation.action === 'wait') {
      setSyncNotice('Отчёт уже отправляется. Дождитесь результата синхронизации.');
      return;
    }

    if (presentation.action === 'done') {
      await leaveToRequestBoard();
      return;
    }

    if (presentation.action === 'repair') {
      setIsSubmitting(true);
      try {
        const scope = await captureDataOwnerContext();
        if (!isCurrent()) return;
        await reopenInvalidCompletionReportLocally(assignmentId);
        await assertDataOwnerContext(scope);
        if (isCurrent()) router.push(`/patrol/assignment/${assignmentId}/all-points?filter=attention`);
      } catch (error) {
        if (isCurrent()) setActionError(error instanceof Error ? error.message : 'Не удалось открыть точки для исправления');
      }
      return;
    }

    if (presentation.action === 'retry') {
      setIsSubmitting(true);
      setSendDialogOpen(true);
      setSyncNotice(null);
      try {
        const scope = await captureDataOwnerContext();
        if (!isCurrent()) return;
        await requestPatrolSync({ mode: 'manualReport', assignmentId });
        await assertDataOwnerContext(scope);
        if (!isCurrent()) return;
        await reload();
      } catch (error) {
        if (isCurrent()) setActionError(error instanceof Error ? error.message : 'Не удалось проверить отправку. Отчёт сохранён в очереди.');
      }
      return;
    }

    await submitLocally(isCurrent);
  }

  async function leaveToRequestBoard() {
    const focus = focusVersion.current;
    try {
      const version = ++loadVersion.current;
      const scope = await captureDataOwnerContext();
      const isCurrent = () => focused.current && version === loadVersion.current;
      await clearCurrentPatrolIfMatches(scope, assignmentId, isCurrent);
      await assertDataOwnerContext(scope);
      const context = await getPatrolDeviceContext();
      await assertDataOwnerContext(scope);
      if (isCurrent() && (!context.assignmentId || context.assignmentId === assignmentId)) router.replace('/patrol/request-board');
    } catch (error) {
      if (focused.current && focus === focusVersion.current) setActionError(error instanceof Error ? error.message : 'Не удалось открыть список заявок');
    }
  }

  async function submitLocally(isCurrent: () => boolean) {
    if (!readiness?.ready) return;
    setIsSubmitting(true);
    setSendDialogOpen(true);
    setSyncNotice(null);

    try {
      const scope = await captureDataOwnerContext();
      if (!isCurrent()) return;
      const queued = await queuePatrolReport(assignmentId);
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      setDelivery({ status: 'queued', clientOperationId: queued.clientOperationId, updatedAtLocal: null, attemptCount: 0 });
      await reload();
      await queued.deliveryAttempt;
      await assertDataOwnerContext(scope);
      if (isCurrent()) await reload();
    } catch (error) {
      if (isCurrent()) setActionError(error instanceof Error
        ? error.message
        : 'Не удалось сохранить отчёт на телефоне');
    }
  }

  if (!readiness) {
    return (
      <Screen title='Отправка отчёта' subtitle='Проверяем локальные результаты обхода'>
        {loadError ? (
          <Card>
            <StatusMessage message={loadError} tone="danger" />
            <PrimaryButton icon='refresh-outline' label='Повторить проверку' onPress={() => void reload()} variant='secondary' />
          </Card>
        ) : (
          <Card><ActivityIndicator color={colors.primary} /></Card>
        )}
      </Screen>
    );
  }


  return (
    <Screen
      compactHeader
      bottomActionBackground='transparent'
      bottomAction={
        <PrimaryButton
          disabled={primaryAction.disabled}
          disabledReason={delivery?.status === 'sending' ? undefined : primaryAction.disabledReason}
          loading={sendBusy || delivery?.status === 'sending'}
          icon={sendBusy ? 'time-outline' : primaryAction.action === 'submit' ? 'send-outline' : primaryAction.icon}
          label={sendBusy || delivery?.status === 'sending' ? 'Отправляем отчёт…' : primaryAction.buttonLabel}
          onPress={() => void runPrimaryAction()}
          size='large'
        />
      }
      title='Проверка отчёта'
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.routeSummary}>
            <Text style={[styles.title, { color: colors.text }]}>
              {readiness.assignment?.routeName ?? 'Обход'}
            </Text>
            <Text style={[styles.count, { color: colors.mutedText }]}>{readiness.progress.completed} из {readiness.progress.total}</Text>
          </View>
          <Pressable accessibilityLabel='Очередь отправки отчётов' accessibilityRole='button' onPress={() => router.push('/settings/sync-queue' as never)} style={styles.menuButton}>
            <Ionicons color={colors.primary} name='cloud-upload-outline' size={24} />
          </Pressable>
        </View>
        {presentation.action !== 'openProblems' ? <View accessibilityLiveRegion='polite' style={[styles.deliveryHeader, { backgroundColor: stateColors.background }]}>
          <Ionicons color={stateColors.foreground} name={presentation.icon} size={26} />
          <View style={styles.deliveryText}>
            <Text style={[styles.sectionTitle, { color: stateColors.foreground }]}>{presentation.title}</Text>
            {presentation.detail ? <Text style={[styles.text, { color: colors.mutedText }]}>{presentation.detail}</Text> : null}
          </View>
        </View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={showStatistics ? "Скрыть статистику" : "Подробная статистика"} accessibilityState={{ expanded: showStatistics }}
          onPress={() => setShowStatistics(value => !value)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: colors.primary, fontSize: 14, lineHeight: 20, fontFamily: "Manrope_600SemiBold" }}>Подробная статистика</Text>
          <Ionicons color={colors.primary} name={showStatistics ? 'chevron-up' : 'chevron-down'} size={20} />
        </Pressable>
        {showStatistics ? <View style={styles.progressRow}>
          <ProgressValue label='Заполнено' value={`${readiness.progress.completed}/${readiness.progress.total}`} />
          <ProgressValue label='Осмотрено' value={`${readiness.progress.inspected}/${readiness.progress.total}`} />
          <ProgressValue label='Замечания' value={String(readiness.progress.issues)} />
          <ProgressValue label='Не осмотрено' value={String(readiness.progress.skipped)} />
          <ProgressValue label='Отложено' value={String(readiness.progress.deferred)} />
        </View> : null}
      </Card>

      {problemGroups.some(problem => problem.orderIndex === 0) ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Проблемы маршрута</Text>
          {problemGroups.filter(problem => problem.orderIndex === 0).map(problem => (
            <StatusMessage key={problem.pointId} message={problem.reasons.join('. ')} tone='warning' />
          ))}
        </Card>
      ) : null}

      {preview ? (
        <ReportPreviewCard rows={preview.rows} attentionCount={preview.attentionCount} onOpenPoint={openPreviewPoint} />
      ) : problemGroups.some(problem => problem.orderIndex > 0) ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Требуют внимания</Text>
          {problemGroups.filter(problem => problem.orderIndex > 0).map((problem) => (
            <ProblemGroupButton
              key={problem.pointId}
              onPress={() => router.push(`/patrol/assignment/${assignmentId}/point/${problem.pointId}/fill`)}
              problem={problem}
            />
          ))}
        </Card>
      ) : null}

      <AutoSubmitCountdown assignmentId={assignmentId} />
      {syncNotice ? <StatusMessage message={syncNotice} /> : null}
      {actionError ? <StatusMessage message={actionError} tone='danger' /> : null}
      {loadError ? <StatusMessage message={loadError} tone="danger" /> : null}

      <View style={styles.links}>
        <Pressable accessibilityRole='button' onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.link}>
          <Ionicons color={colors.primary} name='list-outline' size={18} />
          <Text style={[styles.linkText, { color: colors.primary }]}>Все точки</Text>
        </Pressable>
        {primaryAction.action !== 'done' ? <Pressable accessibilityRole='button' onPress={() => void leaveToRequestBoard()} style={styles.link}>
          <Ionicons color={colors.primary} name='list-outline' size={18} />
          <Text style={[styles.linkText, { color: colors.primary }]}>К выбору заявок</Text>
        </Pressable> : null}
      </View>

      <ActionSheet
        actions={[{ label: 'Понятно', icon: 'checkmark-outline', onPress: () => setIsReadinessNoticeOpen(false) }]}
        onClose={() => setIsReadinessNoticeOpen(false)}
        title={presentation.title}
        message={presentation.detail}
        visible={isReadinessNoticeOpen && presentation.action === 'openProblems'}
      />
      <ReportSendDialog visible={sendDialogOpen} delivery={delivery} busy={isSubmitting} error={actionError}
        onClose={() => setSendDialogOpen(false)} onContinue={() => void leaveToRequestBoard()} />
    </Screen>
  );
}

/** The preview is an aid: a failed read must not hide the readiness summary or block sending. */
async function loadReportPreview(assignmentId: string) {
  try {
    return await getReportPreviewPoints(assignmentId);
  } catch (error) {
    void logMobileError('report.preview.load.failed', error);
    return null;
  }
}

function ProgressValue({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.progressValue, { backgroundColor: colors.backgroundAccent }]}>
      <Text style={[styles.progressLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.progressNumber, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ProblemGroupButton({
  onPress,
  problem
}: {
  onPress: () => void;
  problem: ReportProblemGroup;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`${problem.orderIndex}. ${problem.pointName}. ${problem.reasons.join('. ')}`}
      accessibilityRole='button'
      onPress={onPress}
      style={({ pressed }) => [
        styles.problemButton,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.problemHeader}>
        <Text style={[styles.problemTitle, { color: colors.text }]}>
          {problem.orderIndex}. {problem.pointName}
        </Text>
        <Ionicons color={colors.primary} name='chevron-forward' size={20} />
      </View>
      {problem.reasons.map((reason) => (
        <Text key={reason} style={[styles.reason, { color: colors.mutedText }]}>• {reason}</Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  title: {
    flexShrink: 1,
    fontSize: 20,
    fontFamily: "Manrope_800ExtraBold"
  },
  routeSummary: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  menuButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },
  count: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Manrope_700Bold",
    flexShrink: 0
  },
  progressRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  progressValue: {
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: '42%',
    padding: 10
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: "Manrope_700Bold"
  },
  progressNumber: {
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  },
  deliveryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    borderRadius: 12,
    padding: 12
  },
  deliveryText: {
    flex: 1,
    gap: 4
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Manrope_800ExtraBold"
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  problemButton: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 10,
    minHeight: 56,
    padding: 12
  },
  problemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  problemTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Manrope_800ExtraBold"
  },
  reason: {
    fontSize: 14,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  },
  links: {
    gap: 2
  },
  link: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  }
});
