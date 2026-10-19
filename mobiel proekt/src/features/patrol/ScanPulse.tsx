import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/ui/useReducedMotion';

const RINGS = [0, 1, 2];

/** Filled disc with staggered ripples and a gentle breath while the reader waits for a tag. */
export function ScanPulse({ active, color, icon }: {
  active: boolean;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const [breath] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();
  const animate = active && !reducedMotion;
  useEffect(() => {
    progress.setValue(0);
    breath.setValue(0);
    if (!animate) return;
    const ripple = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true, isInteraction: false
    }));
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
      Animated.timing(breath, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false })
    ]));
    ripple.start();
    breathe.start();
    return () => { ripple.stop(); breathe.stop(); progress.setValue(0); breath.setValue(0); };
  }, [animate, breath, progress]);
  return <View style={styles.container}>
    <View pointerEvents='none' style={[styles.halo, { backgroundColor: color, opacity: 0.12 }]} />
    {animate ? RINGS.map(index => {
      // Each ring runs a third of a cycle behind the previous one.
      const phase = Animated.modulo(Animated.add(progress, index / RINGS.length), 1);
      return <Animated.View key={index} pointerEvents='none' style={[styles.ring, {
        borderColor: color,
        backgroundColor: color,
        opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0] }),
        transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.75] }) }]
      }]} />;
    }) : null}
    <Animated.View style={[styles.disc, {
      backgroundColor: color, shadowColor: color,
      transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }]
    }]}>
      <View pointerEvents='none' style={styles.gloss} />
      <Ionicons name={icon} color='#ffffff' size={56} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 190, height: 190, borderRadius: 95 },
  ring: { position: 'absolute', width: 124, height: 124, borderRadius: 62, borderWidth: 1.5 },
  disc: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  gloss: { position: 'absolute', left: 10, top: 8, width: 70, height: 46, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.22)', transform: [{ rotate: '-20deg' }] }
});
