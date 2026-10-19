import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getReportScope, readPatrolReportDetails, type PatrolReport, type PatrolReportPoints } from '@/db/repositories/patrolReportRepository';
import { getReportDeliveryPresentation } from '@/features/patrol/reportDeliveryPresentation';
import { usePatrolReports } from '@/features/patrol/usePatrolReports';
import { useAppTheme } from '@/features/settings/themePreference';
import { Card } from '@/ui/Card';
import { onHero } from '@/ui/brandPalette';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenList } from '@/ui/Screen';
import { TransientNotice } from '@/ui/TransientNotice';
import { StatusPill } from '@/ui/StatusPill';
import { EmptyState } from '@/ui/EmptyState';
import { GradientFill } from '@/ui/GradientFill';
import { Rise } from '@/ui/motion';
import { font } from '@/ui/typography';

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
  if (detail) {
    const counts = { ok: detail.points.filter(p => p.status === 'ok' || p.status === 'manual').length, issue: detail.points.filter(p => p.status === 'issue').length, photos: detail.points.reduce((sum, p) => sum + (Number(p.photos) || 0), 0) };
    return <ScreenList title="Отчёт обхода" subtitle={detail.title} data={detail.points} keyExtractor={point => point.id}
      onBack={() => setDetail(null)}
      headerContent={<>
        <Rise>
          <View style={[styles.hero, { shadowColor: colors.successFill, backgroundColor: colors.successFill }]}>
            <GradientFill colors={colors} kind="success" radius={24} />
            <View pointerEvents="none" style={styles.heroBubble} />
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><Ionicons name="checkmark" size={26} color={onHero.ink} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), styles.heroTitle]}>{detail.title}</Text>
                <Text style={[font(600), styles.heroText]}>{detail.points.length} точек в отчёте</Text>
              </View>
            </View>
            <View style={styles.heroStats}>
              {[[counts.ok, 'исправно'], [counts.issue, 'неисправно'], [counts.photos, 'фото']].map(([value, label]) => <View key={label} style={styles.heroStat}>
                <Text style={[font(800), styles.heroStatValue]}>{value}</Text>
                <Text style={[font(700), styles.heroStatLabel]}>{label}</Text>
              </View>)}
            </View>
          </View>
        </Rise>
        <PrimaryButton label="К отчётам" variant="ghost" icon="chevron-back" onPress={() => setDetail(null)} />
        {detail.cached ? <Text style={[font(600), { color: colors.mutedText, fontSize: 13, lineHeight: 19 }]}>Сохранённая копия. Фото не загружены для просмотра офлайн.</Text> : null}
      </>}
      renderItem={({ item: point, index }) => {
        const tone = point.status === 'ok' || point.status === 'manual' ? 'success' : point.status === 'issue' ? 'danger' : 'warning';
        return <Rise index={index}>
          <Card style={styles.pointCard}>
            <View style={styles.pointRow}>
              <View style={[styles.pointBadge, { backgroundColor: colors[`${tone}Surface`] }]}>
                <Ionicons name={tone === 'success' ? 'checkmark' : tone === 'danger' ? 'alert' : 'eye-off-outline'} size={16} color={colors[tone]} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[font(800), { color: colors.text, fontSize: 16, lineHeight: 22 }]}>{point.pointName}</Text>
                <Text style={[font(700), { color: colors[tone], fontSize: 13 }]}>{point.status === 'skipped' ? 'Не осмотрена' : point.status === 'ok' ? 'Исправно' : point.status === 'issue' ? 'Неисправно' : point.status === 'manual' ? 'Без NFC — ручной осмотр' : 'Состояние требует проверки'}</Text>
              </View>
              <Text style={[font(700), { color: colors.faintText, fontSize: 12 }]}>Фото: {point.photos}</Text>
            </View>
            {point.comment ? <Text style={[font(600), styles.quote, { color: colors.text, backgroundColor: colors.background, borderLeftColor: colors[tone] }]}>{point.comment}</Text> : null}
          </Card>
        </Rise>;
      }} />;
  }
  return <ScreenList title="Отчёты" subtitle="Итоги обходов и состояние доставки" data={feed.rows} keyExtractor={row => row.assignmentId}
    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    onRefresh={feed.refresh}
    refreshing={false}
    floatingNotice={<TransientNotice message={error ?? feed.notice} />}
    headerContent={<>
      <PrimaryButton label="Обновить" icon="refresh-outline" disabled={feed.busy} variant="ghost" onPress={feed.refresh} />
    </>}
    ListEmptyComponent={<EmptyState icon="document-text-outline" title={feed.busy ? 'Загружаем отчёты…' : 'Отчётов пока нет'} text={feed.busy ? undefined : 'Здесь появятся завершённые обходы и состояние их доставки.'} />}
    ListFooterComponent={feed.rows.length > 0 && feed.hasMore ? <PrimaryButton label="Загрузить ещё" icon="chevron-down-outline" disabled={feed.busy} variant="secondary" onPress={feed.loadMore} /> : null}
    renderItem={({ item: row, index }) => {
      const presentation = getReportDeliveryPresentation(row.delivery ?? null);
      const requiresAction = ['repair', 'signIn', 'serverSettings'].includes(presentation.action);
      const delivered = row.serverConfirmed || row.delivery?.status === 'delivered';
      const label = requiresAction ? 'Требуется действие' : delivered ? 'Получен сервером' : row.delivery?.status === 'sending' ? 'Отправляется' : 'Сохранён на телефоне';
      const tone = requiresAction ? 'danger' : delivered ? 'success' : 'warning';
      return <Rise index={index}>
        <Card>
          <View style={styles.cardTop}>
            <View style={[styles.tile, { backgroundColor: colors[`${tone}Surface`] }]}>
              <Ionicons name={requiresAction ? 'alert-circle-outline' : delivered ? 'document-text-outline' : 'cloud-upload-outline'} size={22} color={colors[tone]} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text style={[font(800), { color: colors.text, fontSize: 17, lineHeight: 22 }]}>{row.routeName}</Text>
              <Text style={[font(600), { color: colors.mutedText, fontSize: 13, lineHeight: 18 }]}>{row.employeeName} · {row.completedAt ? new Date(row.completedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Дата не указана'}</Text>
            </View>
          </View>
          {row.needsReview ? <Text accessibilityRole="alert" style={[font(700), { color: colors.warning }]}>Завершение не подтверждено. Проверьте отчёт вручную.</Text> : null}
          <StatusPill tone={tone} label={label} />
          {requiresAction ? <Text style={[font(600), { color: colors.mutedText, fontSize: 13, lineHeight: 19 }]}>{presentation.detail}</Text> : null}
          <PrimaryButton label="Открыть отчёт" icon="arrow-forward-outline" variant="secondary" disabled={opening} onPress={() => void open(row)} />
        </Card>
      </Rise>;
    }} />;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, gap: 14, overflow: 'hidden', padding: 16, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  heroBubble: { backgroundColor: onHero.bubble, borderRadius: 999, height: 170, position: 'absolute', right: -50, top: -60, width: 170 },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  heroIcon: { alignItems: 'center', backgroundColor: onHero.glass, borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  heroTitle: { color: onHero.ink, fontSize: 18, lineHeight: 24 },
  heroText: { color: onHero.soft, fontSize: 13 },
  heroStats: { flexDirection: 'row', gap: 6 },
  heroStat: { backgroundColor: onHero.chip, borderRadius: 12, flex: 1, paddingHorizontal: 10, paddingVertical: 7 },
  heroStatValue: { color: onHero.ink, fontSize: 18 },
  heroStatLabel: { color: onHero.soft, fontSize: 11 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  tile: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  pointCard: { borderRadius: 18, gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  pointRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  pointBadge: { alignItems: 'center', borderRadius: 15, height: 30, justifyContent: 'center', width: 30 },
  quote: { borderLeftWidth: 3, borderRadius: 8, fontSize: 13, lineHeight: 19, paddingHorizontal: 9, paddingVertical: 6 }
});
