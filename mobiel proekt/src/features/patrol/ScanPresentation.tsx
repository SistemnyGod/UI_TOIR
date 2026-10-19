import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/features/settings/themePreference';
import { ScanPulse } from './ScanPulse';
import { ScanMatrix, ScanTerminalLine } from './ScanMatrix';
import { gradientStops, GradientFill } from '@/ui/GradientFill';
import { font, softShadow } from '@/ui/typography';

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
      <Text style={[styles.count, font(800), { color: colors.text, flex: 1 }]}>{routeName}</Text>
      <View style={[styles.countChip, { backgroundColor: colors.successSurface }]}><Text style={[font(800), styles.countChipText, { color: colors.success }]}>{completed} из {total}</Text></View>
    </View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Заполнение точек"
      accessibilityValue={{ min: 0, max: total || 1, now: completed, text: `${completed} из ${total}` }}
      style={[styles.track, { backgroundColor: colors.track }]}>
      <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: colors.successFill }]}>
        <GradientFill colors={colors} kind="progress" radius={999} />
      </View>
    </View>
    {total > 0 ? <View style={styles.next}>
      <Text style={[styles.caption, font(800), { color: colors.primary }]}>Следующая точка</Text>
      <Text style={[styles.pointName, font(800), { color: colors.text }]}>{nextPoint ? `${nextPoint.orderIndex}. ${nextPoint.name}` : 'Все точки заполнены'}</Text>
    </View> : null}
  </View>;
}

/** Disc centre inside the hero card: top padding plus half of the 200 pt pulse. */
const HERO_DISC_CENTER = 22 + 100;

export function ScanMessage({ message, hint = null, icon, busy = false, tone = 'neutral', hero = false, scanning = false, matrix = false, terminal = null }: {
  scanning?: boolean;
  /** Hex rain, LED rings and a sweeping bar behind the disc while scanning (NFC). */
  matrix?: boolean;
  /** Terminal-style status line under the disc while scanning. */
  terminal?: string | null;
  message: string;
  /** What to do next, shown under the message (e.g. after a wrong tag or a failed read). */
  hint?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  tone?: 'neutral' | 'success' | 'error';
  hero?: boolean;
}) {
  const { colors } = useAppTheme();
  const color = tone === 'success' ? colors.success : tone === 'error' ? colors.danger : colors.primary;
  const discColor = tone === 'success' ? colors.successFill : tone === 'error' ? colors.dangerFill : colors.accent;
  const discGradient = gradientStops(colors, tone === 'success' ? 'success' : tone === 'error' ? 'danger' : 'accent');
  return <View style={[styles.message, hero && styles.hero, hero ? [{ backgroundColor: colors.card, borderColor: colors.cardBorder }, softShadow(colors.shadow, 1)] : null]} accessibilityLiveRegion="polite">
    {hero && matrix ? <ScanMatrix active={scanning} centerY={HERO_DISC_CENTER} background={colors.card} /> : null}
    {hero ? <ScanPulse active={scanning} color={discColor} icon={icon} gradient={discGradient} sweep={matrix} /> : <Ionicons name={icon} color={color} size={24} />}
    {hero && scanning && terminal ? <ScanTerminalLine text={terminal} /> : null}
    <View style={[styles.messageBody, !hero && styles.inlineMessage]}>
      <Text style={[styles.messageText, font(hero ? 800 : 700), hero && styles.heroText, !hero && styles.inlineText, { color: colors.text }]}>{message}</Text>
      {hint ? <Text style={[styles.hintText, font(600), !hero && styles.inlineText, { color: colors.mutedText }]}>{hint}</Text> : null}
    </View>
    {busy ? <ActivityIndicator accessibilityLabel="Проверяем метку" color={color} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  progress: { gap: 10 },
  progressHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  count: { fontSize: 17, lineHeight: 23 },
  countChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  countChipText: { fontSize: 13, lineHeight: 18 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  next: { gap: 4, paddingTop: 6 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  pointName: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  hero: { flexDirection: 'column', gap: 12, overflow: 'hidden', paddingVertical: 22, paddingHorizontal: 18, borderRadius: 28, borderWidth: 1, marginTop: 4 },
  heroText: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  messageBody: { gap: 6 },
  messageText: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  hintText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  inlineMessage: { flex: 1 },
  inlineText: { textAlign: 'left' }
});
