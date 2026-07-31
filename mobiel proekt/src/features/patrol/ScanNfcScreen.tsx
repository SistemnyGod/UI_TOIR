import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, AppStateStatus, ActivityIndicator, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getStoredOwnerUserId } from '@/auth/tokenStorage';
import { currentContourId } from '@/core/environments';
import {
  AssignmentProgress,
  getAssignmentById,
  listAssignmentPoints,
  PointListItem,
  scanPointByNfc
} from '@/db/repositories/patrolRepository';
import {
  getNfcCodes,
  initializeNfc,
  startNfcReaderSession,
  stopNfcReaderSession
} from '@/services/nfcService';
import { useAppTheme } from '@/features/settings/themePreference';
import { requestPatrolSync } from '@/sync/PatrolSyncCoordinator';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { Screen } from '@/ui/Screen';
import { StatusPill } from '@/ui/StatusPill';

type NfcStatus =
  | 'idle'
  | 'reading'
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
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const screenActiveRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const scanInProgressRef = useRef(false);
  const readerStartInProgressRef = useRef(false);
  const lastTagRef = useRef<LastTag | null>(null);
  const [status, setStatus] = useState<NfcStatus>('idle');
  const [routeName, setRouteName] = useState<string | null>(null);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [nextPoint, setNextPoint] = useState<PointListItem | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [message, setMessage] = useState('Поднесите телефон к NFC-метке');

  const handleTag = useCallback(async (tag: unknown) => {
    if (!screenActiveRef.current || !appActiveRef.current || scanInProgressRef.current) {
      return;
    }

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

    scanInProgressRef.current = true;
    setStatus('reading');
    setMessage('Метка обнаружена. Проверяем…');

    try {
      const result = await scanPointByNfc(assignmentId, nfcCodes);
      if (!screenActiveRef.current) {
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
      await stopNfcReaderSession();
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch (error) {
      if (!screenActiveRef.current) {
        return;
      }

      const errorMessage = error instanceof Error
        ? error.message
        : 'NFC недоступен или чтение отменено';

      if (isLifecycleScanBlock(errorMessage)) {
        setStatus('blocked');
        setMessage('Запуск обхода временно восстанавливается');
        void requestPatrolSync({ mode: 'normal' });
      } else {
        setStatus('error');
        setMessage(errorMessage);
        Vibration.vibrate([0, 80, 60, 80]);
      }
    } finally {
      scanInProgressRef.current = false;
    }
  }, [assignmentId, router]);

  const armReaderUnsafe = useCallback(async () => {
    const nfc = await initializeNfc();
    if (!screenActiveRef.current) {
      return;
    }

    if (!nfc.supported) {
      setStatus('unsupported');
      setMessage('Телефон не поддерживает NFC');
      return;
    }

    if (!nfc.enabled) {
      setStatus('disabled');
      setMessage('Включите NFC в настройках телефона');
      return;
    }

    try {
      if (!screenActiveRef.current || !appActiveRef.current) {
        return;
      }

      await startNfcReaderSession(handleTag);
      if (screenActiveRef.current) {
        setStatus('reading');
        setMessage('Поднесите телефон к NFC-метке');
      } else {
        await stopNfcReaderSession();
      }
    } catch (error) {
      if (screenActiveRef.current) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Не удалось включить сканирование NFC');
      }
    }
  }, [handleTag]);

  const armReader = useCallback(async () => {
    if (readerStartInProgressRef.current || !screenActiveRef.current || !appActiveRef.current) {
      return;
    }

    readerStartInProgressRef.current = true;
    try {
      await armReaderUnsafe();
    } finally {
      readerStartInProgressRef.current = false;
    }
  }, [armReaderUnsafe]);

  const loadRouteProgress = useCallback(async () => {
    const ownerUserId = await getStoredOwnerUserId();
    const [assignment, points] = await Promise.all([
      getAssignmentById(assignmentId),
      ownerUserId
        ? listAssignmentPoints(assignmentId, ownerUserId, currentContourId)
        : Promise.resolve([])
    ]);

    if (!screenActiveRef.current) {
      return;
    }

    const loadedProgress = buildProgress(points);
    setRouteName(assignment?.routeName ?? null);
    setProgress(loadedProgress);
    setNextPoint(points.find((point) => !['ok', 'issue', 'skipped'].includes(point.status)) ?? null);
    setProgressError(null);

    if (loadedProgress.total === 0) {
      setStatus('routeUnavailable');
      setMessage('Точки маршрута ещё не загружены');
      return;
    }

    await armReader();
  }, [armReader, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      screenActiveRef.current = true;
      appActiveRef.current = AppState.currentState === 'active';
      const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        const isActive = nextState === 'active';
        appActiveRef.current = isActive;

        if (!isActive) {
          void stopNfcReaderSession();
          return;
        }

        if (screenActiveRef.current) {
          void armReader();
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
        screenActiveRef.current = false;
        appActiveRef.current = false;
        scanInProgressRef.current = false;
        void stopNfcReaderSession();
      };
    }, [armReader, loadRouteProgress])
  );

  return (
    <Screen title='Сканирование NFC'>
      {routeName ? <Text style={[styles.routeName, { color: colors.text }]}>{routeName}</Text> : null}
      {progressError ? <StatusPill label='Прогресс маршрута временно недоступен' tone='warning' /> : null}

      {progress && progress.total > 0 ? (
        <Card>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.text }]}>Прогресс маршрута</Text>
            <Text style={[styles.progressLabel, { color: colors.text }]}>
              {progress.completed} из {progress.total}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPercent(progress)}%` }]} />
          </View>
          <Text style={[styles.progressPercent, { color: colors.mutedText }]}>
            {progressPercent(progress)}%
          </Text>
          <View style={[styles.nextPointBox, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}>
            <Text style={[styles.nextPointLabel, { color: colors.primary }]}>СЛЕДУЮЩАЯ МЕТКА</Text>
            <Text style={[styles.nextPointName, { color: colors.text }]}>
              {nextPoint ? `${nextPoint.orderIndex}. ${nextPoint.name}` : 'Все метки обработаны'}
            </Text>
          </View>
        </Card>
      ) : progress ? (
        <Card>
          <Text style={[styles.progressLabel, { color: colors.text }]}>Загружаем точки маршрута</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Сканирование станет доступно после загрузки точек.
          </Text>
        </Card>
      ) : null}

      <Card>
        <View style={[styles.scanIcon, { backgroundColor: colors.backgroundAccent }]}>
          <Ionicons color={colors.primary} name={status === 'reading' ? 'scan-outline' : 'warning-outline'} size={44} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
        <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
        {status === 'reading' ? <ActivityIndicator color={colors.primary} /> : null}
        {status === 'unmatched' || status === 'error' || status === 'alreadyHandled' ? (
          <Text style={[styles.text, { color: colors.mutedText }]}>
            {status === 'alreadyHandled'
              ? 'Повторное считывание не изменит результат.'
              : 'Оставьте телефон в режиме ожидания и поднесите нужную метку.'}
          </Text>
        ) : null}
      </Card>

      {status === 'routeUnavailable' ? (
        <PrimaryButton
          icon='refresh-outline'
          label='Обновить маршрут'
          onPress={() => void loadRouteProgress()}
        />
      ) : null}

      <PrimaryButton
        icon='list-outline'
        label='Все метки'
        onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)}
        variant='secondary'
      />
    </Screen>
  );
}

function statusLabel(status: NfcStatus) {
  switch (status) {
    case 'reading':
      return 'Ожидание метки';
    case 'matched':
      return 'NFC подтверждён';
    case 'alreadyHandled':
      return 'Уже обработана';
    case 'unmatched':
      return 'Метка другого маршрута';
    case 'unsupported':
      return 'NFC не поддерживается';
    case 'disabled':
      return 'NFC выключен';
    case 'blocked':
      return 'Ожидается восстановление обхода';
    case 'routeUnavailable':
      return 'Маршрут не загружен';
    case 'error':
      return 'Ошибка NFC';
    default:
      return 'Готово';
  }
}

function statusTone(status: NfcStatus) {
  if (status === 'matched') {
    return 'success';
  }

  if (status === 'alreadyHandled') {
    return 'neutral';
  }

  if (status === 'blocked' || status === 'routeUnavailable') {
    return 'warning';
  }

  if (status === 'error' || status === 'unmatched' || status === 'unsupported' || status === 'disabled') {
    return 'danger';
  }

  return 'neutral';
}

function isLifecycleScanBlock(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('действие заблокировано текущим статусом назначения')
    || normalized.includes('действие недоступно для текущего статуса назначения')
    || normalized.includes('point action is unavailable after patrol completion');
}

function progressPercent(progress: AssignmentProgress) {
  if (progress.total === 0) {
    return 0;
  }

  return Math.min(100, Math.round((progress.completed / progress.total) * 100));
}

function buildProgress(points: PointListItem[]): AssignmentProgress {
  return {
    total: points.length,
    completed: points.filter((point) => ['ok', 'issue', 'skipped'].includes(point.status)).length,
    deferred: points.filter((point) => point.status === 'deferred').length,
    issues: points.filter((point) => point.status === 'issue').length,
    skipped: points.filter((point) => point.status === 'skipped').length
  };
}

const styles = StyleSheet.create({
  routeName: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '900'
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: 'hidden'
  },
  progressFill: {
    backgroundColor: '#1e5bff',
    borderRadius: 999,
    height: '100%'
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '800'
  },
  nextPointBox: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  nextPointLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6
  },
  nextPointName: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
    textAlign: 'center'
  },
  scanIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    height: 86,
    justifyContent: 'center',
    width: 86
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  }
});
