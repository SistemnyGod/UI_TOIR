import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/ui/useReducedMotion';

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
      toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false
    }));
    animation.start();
    return () => { animation.stop(); progress.setValue(0); };
  }, [animate, progress]);
  return <View style={styles.container}>
    {animate ? <Animated.View pointerEvents='none' style={[styles.ring, {
      borderColor: color,
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.2] }) }]
    }]} /> : null}
    <Ionicons name={icon} color={color} size={80} />
  </View>;
}

const styles = StyleSheet.create({
  container: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 2 }
});
