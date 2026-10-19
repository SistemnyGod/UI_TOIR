import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/features/settings/themePreference';
import { ScanPulse } from './ScanPulse';

/** Shared route context for NFC and QR. The count describes saved point results. */
export function ScanProgress({ completed, total, nextPoint, routeName = 'Обход' }: {
  routeName?: string;
  completed: number;
  total: number;
  nextPoint?: { orderIndex: number; name: string } | null;
}) {
  const { colors } = useAppTheme();
  const percentage = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
  return <View style={styles.progress}>
    <View style={styles.progressHeading}>
      <Text style={[styles.count, { color: colors.text, flex: 1 }]}>{routeName}</Text>
      <Text style={[styles.count, { color: colors.text }]}>{completed} из {total}</Text>
    </View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Заполнение точек"
      accessibilityValue={{ min: 0, max: total || 1, now: completed, text: `${completed} из ${total}` }}
      style={[styles.track, { backgroundColor: colors.border }]}>
      <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: colors.primary }]} />
    </View>
    {total > 0 ? <View style={styles.next}>
      <Text style={[styles.caption, { color: colors.mutedText }]}>Следующая точка</Text>
      <Text style={[styles.pointName, { color: colors.text }]}>{nextPoint ? `${nextPoint.orderIndex}. ${nextPoint.name}` : 'Все точки заполнены'}</Text>
    </View> : null}
  </View>;
}

export function ScanMessage({ message, icon, busy = false, tone = 'neutral', hero = false, scanning = false }: {
  scanning?: boolean;
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  tone?: 'neutral' | 'success' | 'error';
  hero?: boolean;
}) {
  const { colors } = useAppTheme();
  const color = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.primary;
  return <View style={[styles.message, hero && styles.hero]} accessibilityLiveRegion="polite">
    {hero ? <ScanPulse active={scanning} color={color} icon={icon} /> : <Ionicons name={icon} color={color} size={24} />}
    <Text style={[styles.messageText, !hero && styles.inlineMessage, { color: colors.text }]}>{message}</Text>
    {busy ? <ActivityIndicator accessibilityLabel="Проверяем метку" color={color} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  progress: { gap: 10 },
  progressHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  count: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  track: { height: 7, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  next: { gap: 4, paddingTop: 6 },
  caption: { fontSize: 14, lineHeight: 20 },
  pointName: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  hero: { flexDirection: 'column', gap: 16, paddingVertical: 28 },
  messageText: { fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  inlineMessage: { flex: 1, textAlign: 'left' }
});
