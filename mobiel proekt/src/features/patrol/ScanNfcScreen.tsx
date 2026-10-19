import { ScanActionBar } from "./ScanActionBar";
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Vibration } from 'react-native';
import { ScanMessage, ScanProgress } from './ScanPresentation';

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
  openNfcSettings,
  subscribeNfcAdapterState,
  initializeNfc,
  isNfcEnabled,
  startNfcReaderSession,
  stopNfcReaderSession
} from '@/services/nfcService';
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
  | 'matched'
  | 'alreadyHandled'
  | 'unmatched'
  | 'unsupported'
  | 'disabled'
  | 'blocked'
  | 'routeUnavailable'
  | 'error';

type LastTag = {
  key: string;
  at: number;
};

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
  const armReaderRef = useRef<() => Promise<void>>(async () => undefined);
  const progressReadRef = useRef(0);
  const routeCanScanRef = useRef(false);
  const lastTagRef = useRef<LastTag | null>(null);
  const [status, setStatus] = useState<NfcStatus>('idle');
  const [routeName, setRouteName] = useState<string | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [qrFallbackEnabled, setQrFallbackEnabled] = useState(false);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [nextPoint, setNextPoint] = useState<PointListItem | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [message, setMessage] = useState('Поднесите телефон к NFC-метке');
  const [actionsOpen, setActionsOpen] = useState(false);

  const handleTag = useCallback(async (tag: unknown) => {
    if (!screenActiveRef.current || !appActiveRef.current || scanInProgressRef.current) {
      return;
    }
    if (!routeCanScanRef.current || !readerRunningRef.current) return;

    const nfcCodes = getNfcCodes(tag);
    if (nfcCodes.length === 0) {
      setStatus('error');
      setMessage('Не удалось прочитать код NFC-метки');
      Vibration.vibrate([0, 80, 60, 80]);
      return;
    }

    const tagKey = [...nfcCodes].sort().join('|');
    const previousTag = lastTagRef.current;
    if (previousTag && previousTag.key === tagKey && Date.now() - previousTag.at < 2000) {
      return;
    }
    lastTagRef.current = { key: tagKey, at: Date.now() };

    const ownerEpoch = screenEpochRef.current;
    const isCurrent = () => screenActiveRef.current && appActiveRef.current && routeCanScanRef.current && screenEpochRef.current === ownerEpoch;
    scanInProgressRef.current = true;
    setStatus('processing');
    setMessage('Метка обнаружена. Проверяем…');

    try {
      const result = await scanPointByNfc(assignmentId, nfcCodes);
      if (!isCurrent()) {
        return;
      }

      if (!result.matched) {
        setStatus('unmatched');
        setMessage('Метка не относится к выбранному маршруту');
        Vibration.vibrate([0, 90, 60, 90]);
        return;
      }

      if (result.alreadyScanned || result.alreadyCompleted) {
        setStatus('alreadyHandled');
        setMessage('Метка уже обработана. Поднесите следующую');
        Vibration.vibrate([0, 45]);
        return;
      }

      setStatus('matched');
      setMessage('Метка подтверждена');
      Vibration.vibrate(80);
      readerEpochRef.current++;
      readerRunningRef.current = false;
      await stopNfcReaderSession();
      if (!isCurrent()) return;
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch (error) {
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
        setStatus('blocked');
        setMessage('Запуск обхода временно восстанавливается');
        void requestPatrolSync({ mode: 'normal' });
      } else {
        setStatus('error');
        setMessage(errorMessage);
        Vibration.vibrate([0, 80, 60, 80]);
      }
    } finally {
      // A stale scanner must not unlock a reader owned by the next focused
      // assignment.
      if (screenEpochRef.current === ownerEpoch) scanInProgressRef.current = false;
    }
  }, [assignmentId, router]);

  const armReader = useCallback(async (): Promise<void> => {
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
    setStatus('idle');
    setMessage('Подготавливаем сканирование…');
    try {
      const nfc = await initializeNfc();
      if (!isCurrent()) return;
      if (!nfc.supported) {
        setStatus('unsupported'); setMessage('Телефон не поддерживает NFC'); return;
      }
      if (!nfc.enabled) {
        setStatus('disabled'); setMessage('NFC выключен. Включите NFC в настройках телефона'); return;
      }
      const stopOwnReader = await startNfcReaderSession(handleTag);
      if (!isCurrent()) { await stopOwnReader?.(); return; }
      readerRunningRef.current = true;
      setStatus('reading');
      setMessage('Поднесите телефон к NFC-метке');
    } catch (error) {
      if (isCurrent()) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Не удалось включить сканирование NFC');
      }
    } finally {
      if (readerStartInProgressRef.current === operation) readerStartInProgressRef.current = null;
      if (readerWakeRequestedRef.current) {
        readerWakeRequestedRef.current = false;
        void armReaderRef.current();
      }
    }
  }, [handleTag]);
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
      void stopNfcReaderSession();
    }
    if (loadedProgress.total > 0 && loadedProgress.completed === loadedProgress.total) {
      setStatus('completed'); setMessage('Все точки заполнены. Можно проверить отчёт'); return;
    }
    if (assignment?.status !== 'inProgress' || !scanPolicy.nfcEnabled) {
      setStatus('blocked'); setMessage('Сканирование недоступно для текущего обхода'); return;
    }
    if (loadedProgress.total === 0) {
      setStatus('routeUnavailable');
      setMessage('Точки маршрута ещё не загружены');
      return;
    }

    if (appActiveRef.current) await armReader();
  }, [armReader, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      screenEpochRef.current++;
      screenActiveRef.current = true;
      routeCanScanRef.current = false;
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
          setStatus('disabled');
          setMessage('NFC выключен. Включите NFC в настройках телефона');
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
          setStatus('error');
          setMessage('Не удалось подготовить сканирование');
        }
      });

      return () => {
        isMounted = false;
        appStateSubscription.remove();
        removeAdapterListener();
        removeSyncListener();
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
    }, [armReader, assignmentId, loadRouteProgress])
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

  return (
    <Screen compactHeader plainBackground title='' bottomActionBackground='transparent' bottomAction={<ScanActionBar
      onPoints={() => router.push(`/patrol/assignment/${assignmentId}/all-points` as never)}
      onManual={nextPoint && assignmentStatus === 'inProgress' ? () => router.push(`/patrol/assignment/${assignmentId}/point/${nextPoint.pointId}/fill?manual=1` as never) : undefined}
      onMore={() => setActionsOpen(true)} />} >
      {progress ? <ScanProgress routeName={routeName || 'Сканирование NFC'} completed={progress.completed} total={progress.total} nextPoint={nextPoint} /> : null}
      <ScanMessage
        hero
        scanning={status === 'reading' && !actionsOpen}
        message={progressError ?? message}
        icon={progressError || ['error', 'unmatched', 'disabled'].includes(status) ? 'warning-outline' : ['matched', 'completed'].includes(status) ? 'checkmark-circle-outline' : ['reading', 'processing', 'idle'].includes(status) ? 'radio-outline' : 'information-circle-outline'}
        tone={progressError || ['error', 'unmatched', 'disabled'].includes(status) ? 'error' : ['matched', 'completed'].includes(status) ? 'success' : 'neutral'}
        busy={status === 'processing'}
      />
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
