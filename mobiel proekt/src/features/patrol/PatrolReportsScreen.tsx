import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Text } from 'react-native';
import { getReportScope, readPatrolReportDetails, type PatrolReport, type PatrolReportPoints } from '@/db/repositories/patrolReportRepository';
import { getReportDeliveryPresentation } from '@/features/patrol/reportDeliveryPresentation';
import { usePatrolReports } from '@/features/patrol/usePatrolReports';
import { useAppTheme } from '@/features/settings/themePreference';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenList } from '@/ui/Screen';
import { StatusPill } from '@/ui/StatusPill';

export function PatrolReportsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const feed = usePatrolReports();
  const [detail, setDetail] = useState<{ title: string; points: PatrolReportPoints; cached: boolean } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openVersion = useRef(0);
  const openLock = useRef(false);
  useFocusEffect(useCallback(() => {
    setOpening(false);
    setDetail(null);
    setError(null);
    return () => { openVersion.current++; openLock.current = false; };
  }, []));
  useFocusEffect(useCallback(() => {
    if (!detail) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setDetail(null); return true; });
    return () => back.remove();
  }, [detail]));

  async function open(row: PatrolReport) {
    if (row.local) { router.push(`/patrol/assignment/${row.assignmentId}/submit?mode=history`); return; }
    if (openLock.current) return;
    openLock.current = true;
    const version = ++openVersion.current;
    setOpening(true); setError(null);
    try {
      const scope = await getReportScope();
      const result = await readPatrolReportDetails(scope, row.assignmentId);
      if (version === openVersion.current) setDetail({ title: row.routeName, ...result });
    } catch (caught) {
      if (version === openVersion.current) setError(caught instanceof Error ? caught.message : 'Подробности не загружены. Повторите после восстановления связи.');
    } finally {
      if (version === openVersion.current) { setOpening(false); openLock.current = false; }
    }
  }
  if (detail) return <ScreenList title="Отчёт обхода" subtitle={detail.title} data={detail.points} keyExtractor={point => point.id}
    headerContent={<>
      <PrimaryButton label="К отчётам" variant="secondary" onPress={() => setDetail(null)} />
      {detail.cached ? <Text style={{ color: colors.mutedText }}>Сохранённая копия. Фото не загружены для просмотра офлайн.</Text> : null}
    </>}
    renderItem={({ item: point }) => <Card>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{point.pointName}</Text>
      <Text style={{ color: colors.text }}>{point.status === 'skipped' ? 'Не осмотрена' : point.status === 'ok' ? 'Исправно' : point.status === 'issue' ? 'Неисправно' : point.status}</Text>
      <Text style={{ color: colors.mutedText }}>{point.comment}</Text>
      <Text style={{ color: colors.mutedText }}>Фото: {point.photos}</Text>
    </Card>} />;
  return <ScreenList title="Отчёты" subtitle="Итоги обходов и состояние доставки" data={feed.rows} keyExtractor={row => row.assignmentId}
    headerContent={<>
      {feed.notice || error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedText }}>{error ?? feed.notice}</Text> : null}
      <PrimaryButton label="Обновить" disabled={feed.busy} variant="secondary" onPress={feed.refresh} />
    </>}
    ListEmptyComponent={<Text style={{ color: colors.mutedText }}>{feed.busy ? 'Загружаем отчёты…' : 'Отчётов пока нет'}</Text>}
    ListFooterComponent={feed.hasMore ? <PrimaryButton label="Загрузить ещё" disabled={feed.busy} variant="secondary" onPress={feed.loadMore} /> : null}
    renderItem={({ item: row }) => {
      const presentation = getReportDeliveryPresentation(row.delivery ?? null);
      const requiresAction = ['repair', 'signIn', 'serverSettings'].includes(presentation.action);
      const delivered = row.serverConfirmed || row.delivery?.status === 'delivered';
      const label = requiresAction ? 'Требуется действие' : delivered ? 'Получен сервером' : row.delivery?.status === 'sending' ? 'Отправляется' : 'Сохранён на телефоне';
      return <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{row.routeName}</Text>
        <Text style={{ color: colors.mutedText }}>{row.employeeName}</Text>
        <Text style={{ color: colors.mutedText }}>{row.completedAt ? new Date(row.completedAt).toLocaleString('ru-RU') : 'Дата не указана'}</Text>
        {row.needsReview ? <Text accessibilityRole="alert" style={{ color: '#b45309' }}>Завершение не подтверждено. Проверьте отчёт вручную.</Text> : null}
        <StatusPill tone={requiresAction ? 'danger' : delivered ? 'success' : 'warning'} label={label} />
        {requiresAction ? <Text style={{ color: colors.mutedText }}>{presentation.detail}</Text> : null}
        <PrimaryButton label="Открыть отчёт" variant="secondary" disabled={opening} onPress={() => void open(row)} />
      </Card>;
    }} />;
}
