import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useAppTheme } from '@/features/settings/themePreference';
import { scanMatrix } from '@/ui/brandPalette';
import { useReducedMotion } from '@/ui/useReducedMotion';
import { isDarkTheme } from '@/ui/useThemedStyles';

import { blinkRange, buildMatrix, cyclicRange, MATRIX_LOOP_MS } from './scanMatrixModel';

const TAIL_OPACITY = [0.14, 0.28, 0.5, 0.78];
const LINE = 14;
const RING_DOTS = 28;
const RING_RADIUS = 78;
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

const tones = { dark: scanMatrix.dark, light: scanMatrix.light } as const;

/** One linear native loop shared by every moving part; stops when inactive or under reduced motion. */
function useMatrixClock(active: boolean, duration: number) {
  const [clock] = useState(() => new Animated.Value(0));
  useEffect(() => {
    clock.setValue(0);
    if (!active) return;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => { loop.stop(); clock.setValue(0); };
  }, [active, clock, duration]);
  return clock;
}

/**
 * Decorative backdrop for the NFC scan card: falling hex columns with a bright head and a fading
 * tail, LED-dot rings expanding from the disc and a few blinking cells. Everything is transform or
 * opacity on the native driver; nothing renders under reduced motion.
 */
export function ScanMatrix({ active, centerY, background }: {
  active: boolean;
  /** Vertical centre of the scan disc inside the card, where the rings start. */
  centerY: number;
  /** Card colour that the rain fades into below the disc. */
  background: string;
}) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const running = active && !reduced && size.width > 0;
  const clock = useMatrixClock(running, MATRIX_LOOP_MS);
  const tone = tones[isDarkTheme(colors) ? 'dark' : 'light'];
  const matrix = useMemo(() => buildMatrix(size.width, size.height), [size.width, size.height]);
  const ringDots = useMemo(() => Array.from({ length: RING_DOTS }, (_, index) => {
    const angle = index / RING_DOTS * Math.PI * 2;
    return { left: RING_RADIUS + Math.cos(angle) * RING_RADIUS - 1.5, top: RING_RADIUS + Math.sin(angle) * RING_RADIUS - 1.5 };
  }), []);
  if (!active || reduced) return null;
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (Math.abs(width - size.width) > 1 || Math.abs(height - size.height) > 1) setSize({ width, height });
  };
  const rainHeight = Math.max(0, centerY * 1.7);
  return <View pointerEvents='none' accessibilityElementsHidden importantForAccessibility='no-hide-descendants' style={styles.layer} onLayout={onLayout}>
    {running ? <>
      <View style={[styles.rain, { height: rainHeight }]}>
        {matrix.columns.map((column, index) => {
          const length = column.tail.join('').length + 1;
          return <Animated.View key={index} renderToHardwareTextureAndroid shouldRasterizeIOS style={[styles.column, {
            left: column.x, opacity: column.opacity,
            transform: [{ translateY: clock.interpolate(cyclicRange(column.phase, column.cycles, -length * LINE, rainHeight)) }]
          }]}>
            {column.tail.map((segment, part) => <Text key={part} style={[styles.glyph, { color: tone.rain, opacity: TAIL_OPACITY[part] ?? 0.78 }]}>{segment.split('').join('\n')}</Text>)}
            <Text style={[styles.glyph, { color: tone.head, textShadowColor: tone.glow, textShadowRadius: 8 }]}>{column.head}</Text>
          </Animated.View>;
        })}
        <LinearGradient colors={[`${background}00`, background]} style={[styles.rainFade, { height: rainHeight * 0.45 }]} />
      </View>
      {matrix.cells.map((cell, index) => <Animated.View key={index} style={[styles.cell, {
        left: cell.x, top: cell.y, backgroundColor: tone.cell, shadowColor: tone.glow,
        opacity: clock.interpolate(blinkRange(cell.phase, 0.9))
      }]} />)}
      {[0, 0.5].map(phase => <Animated.View key={phase} style={[styles.ring, {
        top: centerY - RING_RADIUS,
        opacity: clock.interpolate(cyclicRange(phase, 2, 0.75, 0)),
        transform: [{ scale: clock.interpolate(cyclicRange(phase, 2, 0.8, 1.9)) }]
      }]}>
        {ringDots.map((dot, index) => <View key={index} style={[styles.dot, { left: dot.left, top: dot.top, backgroundColor: tone.dot }]} />)}
      </Animated.View>)}
    </> : null}
  </View>;
}

/** «> NFC 13,56 МГц · ожидание метки» with a blinking block caret; decorative, the card message is the status. */
export function ScanTerminalLine({ text }: { text: string }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const clock = useMatrixClock(!reduced, 1000);
  const caretOpacity = reduced ? 1 : clock.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  return <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'
    style={[styles.terminal, { backgroundColor: isDarkTheme(colors) ? scanMatrix.terminal.dark : scanMatrix.terminal.light, borderColor: colors.cardBorder }]}>
    <Text style={[styles.terminalText, { color: colors.primary }]}>{text}</Text>
    <Animated.Text style={[styles.terminalText, { color: colors.primary, opacity: caretOpacity }]}>_</Animated.Text>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' },
  rain: { position: 'absolute', left: 0, top: 0, right: 0, overflow: 'hidden' },
  rainFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  column: { position: 'absolute', top: 0, width: 10, alignItems: 'center' },
  glyph: { fontFamily: mono, fontSize: 11, lineHeight: LINE, fontWeight: '700', textAlign: 'center' },
  cell: { position: 'absolute', width: 10, height: 10, borderRadius: 3, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  ring: { position: 'absolute', alignSelf: 'center', width: RING_RADIUS * 2, height: RING_RADIUS * 2 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
  terminal: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  terminalText: { fontFamily: mono, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.3 }
});
