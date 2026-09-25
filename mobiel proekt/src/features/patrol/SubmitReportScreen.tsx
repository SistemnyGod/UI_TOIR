import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReportDeliveryState, ReportDeliveryStateSnapshot } from '@/domain/reporting/reportDeliveryState';
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { finishDeliveredNavigation, getPatrolReportState, isReportFullyDelivered, deliveredBoardPath } from '@/services/patrolNavigationService';
import { getReportDeliveryState } from '@/db/repositories/outboxRepository';
import { clearCurrentPatrolIfMatches, getPatrolDeviceContext } from '@/db/repositories/patrolContextRepository';
import {
  getReportReadiness,
  reopenInvalidCompletionReportLocally,
  ReportReadiness
} from '@/db/repositories/patrolRepository';
import { getReportDeliveryPresentation } from '@/features/patrol/reportDeliveryPresentation';
import { groupReportProblems, ReportProblemGroup } from '@/features/patrol/reportReadinessPresentation';
import { useAppTheme } from '@/features/settings/themePreference';
import { logMobileError } from '@/services/mobileErrorReporter';
import { shouldReloadReportAfterSync, subscribeToSyncEvents } from '@/sync/syncEvents';
import { requestPatrolSync } from '@/sync/PatrolSyncCoordinator';
import { queuePatrolReport } from '@/features/patrol/reportSubmissionCoordinator';
import { Card } from '@/ui/Card';
import { ConfirmationSheet } from '@/ui/ConfirmationSheet';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { Screen } from '@/ui/Screen';
import { StatusPill } from '@/ui/StatusPill';

type DeliveryState = ReportDeliveryStateSnapshot | null;

export function SubmitReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId, mode } = useLocalSearchParams<{ assignmentId: string; mode?: string }>();
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const didAutoLeaveRef = useRef(false);
  const focused = useRef(false);
  const loadVersion = useRef(0);
  const submitting = useRef(false);

  const reload = useCallback(async () => {
    if (!focused.current) return;
    const version = ++loadVersion.current;
    const isCurrent = () => focused.current && version === loadVersion.current;
    setLoadError(null);
    try {
      const scope = await captureDataOwnerContext();
      const [loadedReadiness, loadedDelivery, reportState] = await Promise.all([
        getReportReadiness(assignmentId),
        getReportDeliveryState(scope.ownerUserId, assignmentId),
        getPatrolReportState(scope, assignmentId)
      ]);
      const reportDelivery = reportState.completedLocally ? loadedDelivery : null;
      const fullyDelivered = reportState.completedLocally && loadedDelivery.status === 'delivered' && await isReportFullyDelivered(scope, assignmentId);
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      setReadiness(loadedReadiness);
      setDelivery(reportDelivery?.status === 'delivered' && !fullyDelivered
        ? { ...reportDelivery, status: 'sending' }
        : reportDelivery);
      if (reportState.completedLocally && loadedDelivery.status === 'delivered' && !fullyDelivered) setSyncNotice('Ожидаем подтверждение обязательных вложений. Отчёт сохранён.');
      if (mode !== 'history' && fullyDelivered && !didAutoLeaveRef.current) {
        if (await finishDeliveredNavigation(scope, assignmentId, isCurrent)) {
          didAutoLeaveRef.current = true;
          router.replace(deliveredBoardPath as never);
        }
      }
    } catch (error) {
      void logMobileError('report.screen.load.failed', error);
      if (isCurrent()) setLoadError(error instanceof Error ? error.message : 'Не удалось прочитать локальный отчёт');
    }
  }, [assignmentId, mode, router]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      didAutoLeaveRef.current = false;
      void reload();
      return () => { focused.current = false; loadVersion.current++; };
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
  const presentation = useMemo(
    () => getReportDeliveryPresentation(delivery),
    [delivery]
  );

  async function handlePrimaryAction() {
    if (isSubmitting) {
      return;
    }

    // Account and repair actions are meaningful even when the local readiness
    // snapshot is stale. Handle them before routing a user to points again.
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
        await reopenInvalidCompletionReportLocally(assignmentId);
        router.push(`/patrol/assignment/${assignmentId}/all-points?filter=attention`);
      } catch (error) {
        setSyncNotice(error instanceof Error ? error.message : 'Не удалось открыть точки для исправления');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (presentation.action === 'retry') {
      setIsSubmitting(true);
      setSyncNotice(null);
      try {
        await requestPatrolSync({ mode: 'manualReport', assignmentId });
        await reload();
        setSyncNotice('Повторная отправка запланирована');
      } catch (error) {
        setSyncNotice(error instanceof Error ? error.message : 'Отчёт останется в очереди и будет отправлен автоматически');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsConfirmOpen(true);
  }

  async function leaveToRequestBoard() {
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
      setSyncNotice(error instanceof Error ? error.message : 'Не удалось открыть список заявок');
    }
  }

  async function confirmLocalSubmission() {
    if (submitting.current || !readiness?.ready) {
      return;
    }

    if (!readiness?.ready) {
      router.push(`/patrol/assignment/${assignmentId}/all-points?filter=attention`);
      return;
    }
    submitting.current = true;
    setIsConfirmOpen(false);
    setIsSubmitting(true);
    setSyncNotice(null);

    try {
      await queuePatrolReport(assignmentId);
      await reload();
      setSyncNotice('Отчёт сохранён на телефоне и отправляется автоматически');
    } catch (error) {
      setSyncNotice(error instanceof Error
        ? error.message
        : 'Не удалось сохранить отчёт на телефоне');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  if (!readiness) {
    return (
      <Screen title='Отправка отчёта' subtitle='Проверяем локальные результаты обхода'>
        {loadError ? (
          <Card>
            <Text style={styles.error}>{loadError}</Text>
            <PrimaryButton icon='refresh-outline' label='Повторить проверку' onPress={() => void reload()} variant='secondary' />
          </Card>
        ) : (
          <Card><ActivityIndicator color={colors.primary} /></Card>
        )}
      </Screen>
    );
  }

  const actionDisabled = isSubmitting || presentation.action === 'wait' || !readiness.ready && problemGroups.length === 0;
  const primaryLabel = !readiness.ready ? 'Открыть незаполненные' : presentation.buttonLabel;

  return (
    <Screen
      bottomAction={
        <PrimaryButton
          disabled={actionDisabled}
          icon={isSubmitting ? 'time-outline' : 'send-outline'}
          label={isSubmitting ? 'Сохраняем отчёт…' : primaryLabel}
          onPress={() => void handlePrimaryAction()}
          size='large'
        />
      }
      title='Проверка отчёта'
      subtitle='Результаты сохраняются на телефоне до подтверждённой доставки'
    >
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>
            {readiness.assignment?.routeName ?? 'Обход'}
          </Text>
          <StatusPill
            label={readiness.ready ? 'Все точки заполнены' : `Осталось: ${problemGroups.length}`}
            tone={readiness.ready ? 'success' : 'warning'}
          />
        </View>
        <View style={styles.progressRow}>
          <ProgressValue label='Обработано' value={`${readiness.progress.completed}/${readiness.progress.total}`} />
          <ProgressValue label='Осмотрено' value={`${readiness.progress.inspected}/${readiness.progress.total}`} />
          <ProgressValue label='Замечания' value={String(readiness.progress.issues)} />
          <ProgressValue label='Не осмотрено' value={String(readiness.progress.skipped)} />
          <ProgressValue label='Отложено' value={String(readiness.progress.deferred)} />
        </View>
      </Card>

      <Card>
        <View style={styles.deliveryHeader}>
          <Ionicons color={colors.primary} name='cloud-upload-outline' size={24} />
          <View style={styles.deliveryText}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{presentation.title}</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>{presentation.detail}</Text>
            <Text style={[styles.statusText, { color: colors.mutedText }]}>
              {deliveryStateLabel(delivery?.status ?? null)}
            </Text>
          </View>
        </View>
      </Card>

      {problemGroups.length > 0 ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Нужно заполнить перед отправкой</Text>
          {problemGroups.map((problem) => problem.orderIndex === 0 ? (
            <Text key={problem.pointId} style={[styles.text, styles.error]}>{problem.reasons.join('. ')}</Text>
          ) : (
            <ProblemGroupButton
              key={problem.pointId}
              onPress={() => router.push(`/patrol/assignment/${assignmentId}/point/${problem.pointId}/fill`)}
              problem={problem}
            />
          ))}
        </Card>
      ) : null}

      {syncNotice ? <Text accessibilityLiveRegion='polite' style={styles.notice}>{syncNotice}</Text> : null}
      {loadError ? <Text accessibilityLiveRegion='polite' style={styles.error}>{loadError}</Text> : null}

      <View style={styles.links}>
        <Pressable accessibilityRole='button' onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.link}>
          <Ionicons color={colors.primary} name='list-outline' size={18} />
          <Text style={[styles.linkText, { color: colors.primary }]}>Все точки</Text>
        </Pressable>
        <Pressable accessibilityRole='button' onPress={() => router.push('/settings/sync-queue' as never)} style={styles.link}>
          <Ionicons color={colors.primary} name='cloud-upload-outline' size={18} />
          <Text style={[styles.linkText, { color: colors.primary }]}>Статус отправки</Text>
        </Pressable>
        <Pressable accessibilityRole='button' onPress={() => void leaveToRequestBoard()} style={styles.link}>
          <Ionicons color={colors.primary} name='list-outline' size={18} />
          <Text style={[styles.linkText, { color: colors.primary }]}>К выбору заявок</Text>
        </Pressable>
      </View>

      <ConfirmationSheet
        confirmLabel='Да, завершить'
        disabled={isSubmitting}
        message='Отчёт будет сразу сохранён на телефоне. При наличии сети отправка начнётся автоматически.'
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void confirmLocalSubmission()}
        title='Завершить и отправить отчёт?'
        visible={isConfirmOpen}
      />
    </Screen>
  );
}

function ProgressValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressValue}>
      <Text style={styles.progressLabel}>{label}</Text>
      <Text style={styles.progressNumber}>{value}</Text>
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

function deliveryStateLabel(status: ReportDeliveryState['status'] | null) {
  if (status === 'delivered') return 'Сервер: принято';
  if (status === 'queued' || status === 'sending') return 'Телефон: сохранено — отправляется';
  if (status === 'retryScheduled' || status === 'waitingNetwork') return 'Телефон: сохранено — повтор будет автоматически';
  if (status === 'repairRequired' || status === 'conflict' || status === 'blockedByDependency' || status === 'wrongContour') {
    return 'Телефон: сохранено — требуется действие';
  }
  return 'Телефон: сохранено локально';
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800'
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  progressValue: {
    backgroundColor: '#f6f9fe',
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: 0,
    padding: 10
  },
  progressLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  progressNumber: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900'
  },
  deliveryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12
  },
  deliveryText: {
    flex: 1,
    gap: 4
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900'
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800'
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
    fontSize: 15,
    fontWeight: '800'
  },
  reason: {
    fontSize: 13,
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
    fontWeight: '800'
  },
  notice: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderRadius: 12,
    borderWidth: 1,
    color: '#166534',
    fontSize: 14,
    lineHeight: 20,
    padding: 12
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20
  }
});
