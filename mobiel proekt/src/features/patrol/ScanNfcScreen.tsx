import { ScanActionBar } from "./ScanActionBar";
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ScanMessage, ScanProgress } from './ScanPresentation';
import { createNfcReadRetryTracker, nfcReaderStartRetryDelaysMs, type NfcReadFailureKind } from './nfcReadRetryPolicy';
import { logNfcReadFailure, logScanMatchFailure } from './scanDiagnostics';
import { holdStillHint, presentScanOutcome, scanOutcomeRoute, type ScanOutcomeAction } from './scanOutcome';
import { resolveScanOutcome } from './scanOutcomeResolver';
import { useScanKeepAwake } from './useScanKeepAwake';

import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { shouldReloadAssignmentAfterSync, subscribeToSyncEvents } from '@/sync/syncEvents';
import {
  AssignmentProgress,
  getAssignmentById,
  getAssignmentScanPolicy,
  listAssignmentPoints,
  pauseAssignmentLocally,
  PointListItem,
  scanPointByNfc
} from '@/db/repositories/patrolRepository';
import {
  getNfcCodes,
  isIncompleteNdefRead,
  openNfcSettings,
  subscribeNfcAdapterState,
  initializeNfc,
  isNfcEnabled,
  startNfcReaderSession,
  stopNfcReaderSession
} from '@/services/nfcService';
import { claimNfcScanScreen } from '@/services/nfcGuardService';
import { nfcReadMemory } from '@/services/nfcReadMemory';
import { playScanFeedback } from '@/services/scanFeedback';
import { requestPatrolSync } from '@/sync/PatrolSyncCoordinator';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { Screen } from '@/ui/Screen';
import { ActionSheet } from '@/ui/ActionSheet';
import { buildPatrolActionMenu } from '@/features/patrol/patrolActionMenu';

type NfcStatus =
  | 'completed'
  | 'idle'
  | 'reading'
  | 'processing'
  | 'retrying'
  | 'matched'
  | 'alreadyHandled'
  | 'unmatched'
  | 'unsupported'
  | 'disabled'
  | 'blocked'
  | 'routeUnavailable'
  | 'error';

const readPrompt = 'Поднесите телефон к NFC-метке';
const rereadMessage = 'Метка не дочиталась. Не убирайте телефон — читаем ещё раз';
/** After a silent re-arm with no tag in the field, fall back to the normal prompt. */
const rereadPromptMs = 3000;

export function ScanNfcScreen() {
  const router = useRouter();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const screenActiveRef = useRef(false);
  const screenEpochRef = useRef(0);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const scanInProgressRef = useRef(false);
  const readerStartInProgressRef = useRef<object | null>(null);
  const readerEpochRef = useRef(0);
  const readerRunningRef = useRef(false);
  const readerWakeRequestedRef = useRef(false);
  const armReaderRef = useRef<(quiet?: boolean) => Promise<void>>(async () => undefined);
  const progressReadRef = useRef(0);
  const routeCanScanRef = useRef(false);
  const readRetryRef = useRef(createNfcReadRetryTracker());
  const readerStartFailuresRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<NfcStatus>('idle');
  const [routeName, setRouteName] = useState<string | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [qrFallbackEnabled, setQrFallbackEnabled] = useState(false);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [nextPoint, setNextPoint] = useState<PointListItem | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [message, setMessage] = useState(readPrompt);
  const [hint, setHint] = useState<string | null>(null);
  const [outcomeAction, setOutcomeAction] = useState<ScanOutcomeAction | null>(null);
  const [readerFailed, setReaderFailed] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  useScanKeepAwake('patrol-scan-nfc');

  const show = useCallback((nextStatus: NfcStatus, nextMessage: string, nextHint: string | null = null, action: ScanOutcomeAction | null = null) => {
    setStatus(nextStatus);
    setMessage(nextMessage);
    setHint(nextHint);
    setOutcomeAction(action);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  /** Re-arms the reader after a delay; Android then re-polls a tag that is still held. */
  const scheduleReaderRestart = useCallback((delayMs: number) => {
    const epoch = screenEpochRef.current;
    clearRetryTimer();
    readerEpochRef.current++;
    readerRunningRef.current = false;
    void stopNfcReaderSession();
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (screenEpochRef.current === epoch) void armReaderRef.current(true);
    }, delayMs);
  }, [clearRetryTimer]);

  const handleReadFailure = useCallback((kind: NfcReadFailureKind) => {
    const decision = readRetryRef.current.recordFailure(kind);
    logNfcReadFailure(assignmentId, kind, decision.attempt, decision.retry);
    if (decision.retry) {
      show('retrying', rereadMessage);
      scheduleReaderRestart(decision.delayMs);
      return;
    }
    show('error', 'Не удалось прочитать NFC-метку', decision.showHint ? holdStillHint : 'Поднесите телефон к метке ещё раз.');
    playScanFeedback('readError');
  }, [assignmentId, scheduleReaderRestart, show]);

  const handleTag = useCallback(async (tag: unknown) => {
    if (!screenActiveRef.current || !appActiveRef.current || scanInProgressRef.current) {
      return;
    }
    if (!routeCanScanRef.current || !readerRunningRef.current) return;

    const nfcCodes = getNfcCodes(tag);
    if (nfcCodes.length === 0) {
      handleReadFailure('unreadableTag');
      return;
    }
    const incompleteRead = isIncompleteNdefRead(tag);

    // A second report of the same touch keeps the outcome on screen; a later touch
    // of a marked point gets the repository's "already marked" outcome.
    if (nfcReadMemory.isDuplicate(nfcCodes)) return;
    nfcReadMemory.recordRead(nfcCodes);

    const ownerEpoch = screenEpochRef.current;
    const isCurrent = () => screenActiveRef.current && appActiveRef.current && routeCanScanRef.current && screenEpochRef.current === ownerEpoch;
    scanInProgressRef.current = true;
    show('processing', 'Метка обнаружена. Проверяем…');

    try {
      const outcome = await resolveScanOutcome(assignmentId, 'nfc', nfcCodes, () => scanPointByNfc(assignmentId, nfcCodes));
      if (!isCurrent()) {
        return;
      }
      if (outcome.kind === 'unknown' && incompleteRead) {
        // Re-read the same tag instead of calling a half-read route tag foreign.
        nfcReadMemory.forget(nfcCodes);
        handleReadFailure('tagLost');
        return;
      }
      readRetryRef.current.recordSuccess();

      const view = presentScanOutcome(outcome, 'nfc');
      playScanFeedback(view.feedback);
      logScanMatchFailure(assignmentId, 'nfc', outcome);
      if (outcome.kind === 'confirmed' || outcome.kind === 'alreadyScanned' || outcome.kind === 'alreadyCompleted') {
        nfcReadMemory.markTag(nfcCodes);
      }
      // Duplicate, wrong-point and unknown tags leave the route unchanged; the reader stays armed.
      if (outcome.kind !== 'confirmed') {
        show(outcome.kind === 'alreadyScanned' || outcome.kind === 'alreadyCompleted' ? 'alreadyHandled' : 'unmatched',
          view.message, view.hint, view.action);
        return;
      }

      show('matched', view.message);
      readerEpochRef.current++;
      readerRunningRef.current = false;
      await stopNfcReaderSession();
      if (!isCurrent()) return;
      router.replace(`/patrol/assignment/${assignmentId}/point/${outcome.point.pointId}/fill`);
    } catch (error) {
      nfcReadMemory.forget(nfcCodes);
      if (!isCurrent()) {
        return;
      }

      const errorMessage = error instanceof Error
        ? error.message
        : 'NFC недоступен или чтение отменено';

      if (isLifecycleScanBlock(errorMessage)) {
        routeCanScanRef.current = false;
        readerEpochRef.current++;
        readerRunningRef.current = false;
        void stopNfcReaderSession();
        show('blocked', 'Запуск обхода временно восстанавливается');
        void requestPatrolSync({ mode: 'normal' });
      } else {
        show('error', errorMessage);
        playScanFeedback('readError');
      }
    } finally {
      // A stale scanner must not unlock a reader owned by the next focused
      // assignment.
      if (screenEpochRef.current === ownerEpoch) scanInProgressRef.current = false;
    }
  }, [assignmentId, handleReadFailure, router, show]);

  const armReader = useCallback(async (quiet = false): Promise<void> => {
    if (!screenActiveRef.current || !appActiveRef.current || !routeCanScanRef.current || readerRunningRef.current || scanInProgressRef.current) return;
    if (readerStartInProgressRef.current) {
      // Keep an ON event that arrives while the disabled lookup is pending.
      readerWakeRequestedRef.current = true;
      return;
    }
    const operation = {};
    const epoch = screenEpochRef.current;
    const readerEpoch = readerEpochRef.current;
    const isCurrent = () => screenActiveRef.current && appActiveRef.current && routeCanScanRef.current
      && screenEpochRef.current === epoch && readerEpochRef.current === readerEpoch;
    readerStartInProgressRef.current = operation;
    readerWakeRequestedRef.current = false;
    clearRetryTimer();
    setReaderFailed(false);
    // A silent retry keeps the "reading again" message instead of flashing a setup state.
    if (!quiet) show('idle', 'Подготавливаем сканирование…');
    try {
      const nfc = await initializeNfc();
      if (!isCurrent()) return;
      if (!nfc.supported) {
        show('unsupported', 'Телефон не поддерживает NFC'); return;
      }
      if (!nfc.enabled) {
        show('disabled', 'NFC выключен. Включите NFC в настройках телефона'); return;
      }
      const stopOwnReader = await startNfcReaderSession(handleTag);
      if (!isCurrent()) { await stopOwnReader?.(); return; }
      readerRunningRef.current = true;
      readerStartFailuresRef.current = 0;
      if (quiet) {
        setStatus('reading');
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          setMessage(current => current === rereadMessage ? readPrompt : current);
        }, rereadPromptMs);
      } else show('reading', readPrompt);
    } catch {
      if (isCurrent()) {
        const attempt = ++readerStartFailuresRef.current;
        const delayMs = nfcReaderStartRetryDelaysMs[attempt - 1];
        logNfcReadFailure(assignmentId, 'readerStart', attempt, delayMs !== undefined);
        if (delayMs !== undefined) {
          show('retrying', 'Подготавливаем сканирование…');
          scheduleReaderRestart(delayMs);
        } else {
          readerStartFailuresRef.current = 0;
          setReaderFailed(true);
          show('error', 'Не удалось включить сканирование NFC',
            'Нажмите «Повторить». Если не помогло, выключите и снова включите NFC в настройках телефона.');
          playScanFeedback('readError');
        }
      }
    } finally {
      if (readerStartInProgressRef.current === operation) readerStartInProgressRef.current = null;
      if (readerWakeRequestedRef.current) {
        readerWakeRequestedRef.current = false;
        void armReaderRef.current();
      }
    }
  }, [assignmentId, clearRetryTimer, handleTag, scheduleReaderRestart, show]);
  useLayoutEffect(() => { armReaderRef.current = armReader; }, [armReader]);

  const loadRouteProgress = useCallback(async () => {
    const epoch = screenEpochRef.current;
    const read = ++progressReadRef.current;
    const scope = await captureDataOwnerContext();
    const [assignment, points, scanPolicy] = await Promise.all([
      getAssignmentById(assignmentId),
      listAssignmentPoints(assignmentId, scope.ownerUserId, scope.contourId),
      getAssignmentScanPolicy(assignmentId)
    ]);

    await assertDataOwnerContext(scope);
    if (!screenActiveRef.current || screenEpochRef.current !== epoch || read !== progressReadRef.current) {
      return;
    }

    const loadedProgress = buildProgress(points);
    setRouteName(assignment?.routeName ?? null);
    setAssignmentStatus(assignment?.status ?? null);
    setQrFallbackEnabled(scanPolicy.qrFallbackEnabled);
    setProgress(loadedProgress);
    setNextPoint(points.find((point) => !['ok', 'issue', 'skipped'].includes(point.status)) ?? null);
    setProgressError(null);

    const canScan = assignment?.status === 'inProgress' && scanPolicy.nfcEnabled && points.length > 0
      && loadedProgress.completed < loadedProgress.total;
    routeCanScanRef.current = canScan;
    if (!canScan) {
      readerEpochRef.current++;
      readerRunningRef.current = false;
      readerWakeRequestedRef.current = false;
      clearRetryTimer();
      void stopNfcReaderSession();
    }
    if (loadedProgress.total > 0 && loadedProgress.completed === loadedProgress.total) {
      show('completed', 'Все точки заполнены. Можно проверить отчёт'); return;
    }
    if (assignment?.status !== 'inProgress' || !scanPolicy.nfcEnabled) {
      show('blocked', 'Сканирование недоступно для текущего обхода'); return;
    }
    if (loadedProgress.total === 0) {
      show('routeUnavailable', 'Точки маршрута ещё не загружены');
      return;
    }

    if (appActiveRef.current) await armReader();
  }, [armReader, assignmentId, clearRetryTimer, show]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      screenEpochRef.current++;
      screenActiveRef.current = true;
      routeCanScanRef.current = false;
      const releaseScanClaim = claimNfcScanScreen();
      nfcReadMemory.setScope(assignmentId);
      nfcReadMemory.clearRecentRead();
      readRetryRef.current.reset();
      readerStartFailuresRef.current = 0;
      setStatus('idle');
      appActiveRef.current = AppState.currentState === 'active';
      const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        const isActive = nextState === 'active';
        const wasActive = appActiveRef.current;
        appActiveRef.current = isActive;

        if (!isActive) {
          screenEpochRef.current++;
          readerEpochRef.current++;
          readerRunningRef.current = false;
          readerWakeRequestedRef.current = false;
          scanInProgressRef.current = false;
          clearRetryTimer();
          setStatus('idle');
          void stopNfcReaderSession();
          return;
        }

        if (screenActiveRef.current && !wasActive) {
          void loadRouteProgress().catch(() => {
            if (screenActiveRef.current) setProgressError('Не удалось обновить маршрут. Данные на телефоне сохранены.');
          });
        }
      });
      const removeAdapterListener = subscribeNfcAdapterState(enabled => {
        if (!screenActiveRef.current || !routeCanScanRef.current) return;
        if (!enabled) {
          readerEpochRef.current++;
          readerRunningRef.current = false;
          readerWakeRequestedRef.current = false;
          clearRetryTimer();
          show('disabled', 'NFC выключен. Включите NFC в настройках телефона');
          void stopNfcReaderSession();
        } else if (appActiveRef.current) void armReader();
      });
      const removeSyncListener = subscribeToSyncEvents(event => {
        if (screenActiveRef.current && shouldReloadAssignmentAfterSync(event, assignmentId)) {
          void loadRouteProgress().catch(() => {
            if (isMounted) setProgressError('Не удалось обновить маршрут. Данные на телефоне сохранены.');
          });
        }
      });
      void loadRouteProgress().catch(() => {
        if (isMounted) {
          setProgressError('Прогресс маршрута временно недоступен. Данные на телефоне сохранены.');
          show('error', 'Не удалось подготовить сканирование');
        }
      });

      return () => {
        isMounted = false;
        releaseScanClaim();
        appStateSubscription.remove();
        removeAdapterListener();
        removeSyncListener();
        clearRetryTimer();
        readerEpochRef.current++;
        readerRunningRef.current = false;
        readerWakeRequestedRef.current = false;
        progressReadRef.current++;
        routeCanScanRef.current = false;
        setStatus('idle');
        screenActiveRef.current = false;
        screenEpochRef.current++;
        appActiveRef.current = false;
        scanInProgressRef.current = false;
        void stopNfcReaderSession();
      };
    }, [armReader, assignmentId, clearRetryTimer, loadRouteProgress, show])
  );

  useEffect(() => {
    if (status !== 'disabled') return;
    let active = true;
    let checking = false;
    const timer = setInterval(() => {
      if (!active || checking || !screenActiveRef.current || !appActiveRef.current || !routeCanScanRef.current) return;
      checking = true;
      void isNfcEnabled().then(enabled => {
        if (active && enabled) void armReader();
      }).catch(() => { /* Retain the disabled state and retry later. */ }).finally(() => { checking = false; });
    }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [armReader, status]);

  const warning = !!progressError || ['error', 'unmatched', 'disabled'].includes(status);
  return (
    <Screen compactHeader plainBackground title='' bottomActionBackground='transparent' bottomAction={<ScanActionBar
      onPoints={() => router.push(`/patrol/assignment/${assignmentId}/all-points` as never)}
      onManual={nextPoint && assignmentStatus === 'inProgress' ? () => router.push(`/patrol/assignment/${assignmentId}/point/${nextPoint.pointId}/fill?manual=1` as never) : undefined}
      onMore={() => setActionsOpen(true)} />} >
      {progress ? <ScanProgress routeName={routeName || 'Сканирование NFC'} completed={progress.completed} total={progress.total} nextPoint={nextPoint} /> : null}
      <ScanMessage
        hero
        scanning={(status === 'reading' || status === 'retrying') && !actionsOpen}
        message={progressError ?? message}
        hint={progressError ? null : hint}
        icon={warning ? 'warning-outline' : ['matched', 'completed'].includes(status) ? 'checkmark-circle-outline' : ['reading', 'processing', 'retrying', 'idle'].includes(status) ? 'radio-outline' : 'information-circle-outline'}
        tone={warning ? 'error' : ['matched', 'completed'].includes(status) ? 'success' : 'neutral'}
        busy={status === 'processing'}
      />
      {outcomeAction ? <PrimaryButton label={outcomeAction.label} icon='navigate-outline' variant='secondary'
        onPress={() => {
          const target = scanOutcomeRoute(assignmentId, outcomeAction);
          if (outcomeAction.target === 'fill') router.replace(target as never);
          else router.push(target as never);
        }} /> : null}
      {status === 'error' && readerFailed ? <PrimaryButton label='Повторить' icon='refresh-outline'
        onPress={() => void armReader()} /> : null}
      {status === 'disabled' ? <PrimaryButton label='Включить NFC' icon='settings-outline' variant='secondary'
        onPress={() => void openNfcSettings().catch(() => {
          if (screenActiveRef.current) setMessage('Откройте настройки телефона → Подключения → NFC и включите NFC');
        })} /> : null}
      {status === 'routeUnavailable' ? (
        <PrimaryButton
          icon='refresh-outline'
          label='Обновить маршрут'
          onPress={() => void loadRouteProgress()}
        />
      ) : null}

      <ActionSheet
        title="Действия с обходом"
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        actions={buildPatrolActionMenu({
          assignmentId,
          status: assignmentStatus ?? 'unknown',
          onPause: () => void pauseAssignmentLocally(assignmentId)
            .then(() => router.replace(`/patrol/assignment/${assignmentId}` as never))
            .catch((error) => setProgressError(error instanceof Error ? error.message : 'Не удалось приостановить обход.')),
          onSwitch: () => router.push(`/patrol/assignment/${assignmentId}/switch` as never),
          onQr: qrFallbackEnabled && assignmentStatus === 'inProgress' ? () => router.replace(`/patrol/assignment/${assignmentId}/scan-qr` as never) : undefined,
          onSubmit: () => router.push(`/patrol/assignment/${assignmentId}/submit` as never),
          onAppeal: () => router.push(`/patrol/assignment/${assignmentId}/appeal` as never),
          onCancel: () => router.push(`/patrol/assignment/${assignmentId}/appeal?kind=cancel` as never)
        })}
      />
    </Screen>
  );
}

function isLifecycleScanBlock(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('действие заблокировано текущим статусом назначения')
    || normalized.includes('действие недоступно для текущего статуса назначения')
    || normalized.includes('point action is unavailable after patrol completion');
}

function buildProgress(points: PointListItem[]): AssignmentProgress {
  return {
    total: points.length,
    inspected: points.filter((point) => point.status === 'ok' || point.status === 'issue').length,
    completed: points.filter((point) => ['ok', 'issue', 'skipped'].includes(point.status)).length,
    deferred: points.filter((point) => point.status === 'deferred').length,
    issues: points.filter((point) => point.status === 'issue').length,
    skipped: points.filter((point) => point.status === 'skipped').length
  };
}
