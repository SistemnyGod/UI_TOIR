import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/ui/useReducedMotion';

const RING_PHASES = [0, 1 / 3, 2 / 3];

/** Ranges that make one 0→1 loop drive a ring that starts `phase` of a cycle later. */
function phased(phase: number, from: number, to: number) {
  if (phase === 0) return { inputRange: [0, 1], outputRange: [from, to] };
  const wrap = 1 - phase;
  const atStart = from + (to - from) * phase;
  return { inputRange: [0, wrap, wrap + 0.0001, 1], outputRange: [atStart, to, from, atStart] };
}

/** Filled disc with staggered ripples and a gentle breath, all driven by one native loop. */
export function ScanPulse({ active, color, icon }: {
  active: boolean;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();
  const animate = active && !reducedMotion;
  useEffect(() => {
    progress.setValue(0);
    if (!animate) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true, isInteraction: false
    }));
    animation.start();
    return () => { animation.stop(); progress.setValue(0); };
  }, [animate, progress]);
  const disc = <View style={[styles.disc, { backgroundColor: color, shadowColor: color }]}>
    <View pointerEvents='none' style={styles.gloss} />
    <Ionicons name={icon} color='#ffffff' size={56} />
  </View>;
  return <View style={styles.container}>
    <View pointerEvents='none' style={[styles.halo, { backgroundColor: color }]} />
    {animate ? RING_PHASES.map(phase => <Animated.View key={phase} pointerEvents='none' style={[styles.ring, {
      borderColor: color,
      backgroundColor: color,
      opacity: progress.interpolate(phased(phase, 0.22, 0)),
      transform: [{ scale: progress.interpolate(phased(phase, 0.9, 1.75)) }]
    }]} />) : null}
    {animate ? <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.045, 1] }) }] }}>{disc}</Animated.View> : disc}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 190, height: 190, borderRadius: 95, opacity: 0.12 },
  ring: { position: 'absolute', width: 124, height: 124, borderRadius: 62, borderWidth: 1.5 },
  disc: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  gloss: { position: 'absolute', left: 10, top: 8, width: 70, height: 46, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.22)', transform: [{ rotate: '-20deg' }] }
});
