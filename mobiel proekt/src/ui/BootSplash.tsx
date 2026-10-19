import { useEffect, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { BrandLogo } from "@/ui/BrandMark";
import { font } from "@/ui/typography";
import { useReducedMotion } from "@/ui/useReducedMotion";

/** Startup screen shown while secure storage and fonts are prepared. */
export function BootSplash({ message = "Подготавливаем защищённое хранилище…" }: { message?: string }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [appear] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) { appear.setValue(1); return; }
    Animated.timing(appear, { toValue: 1, duration: 700, easing: Easing.bezier(0.2, 0.9, 0.3, 1.2), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [appear, reduced, sweep]);
  return <View accessibilityLabel={message} style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }}>
    <View style={{ position: "absolute", width: 360, height: 360, borderRadius: 180, backgroundColor: colors.backgroundAccent, opacity: 0.55, top: "18%" }} />
    <Animated.View style={{ opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
      <BrandLogo size={96} large />
    </Animated.View>
    <Text style={[font(700), { marginTop: 16, fontSize: 14, color: colors.mutedText }]}>Обходы оборудования · Patrol360</Text>
    <View style={{ position: "absolute", left: 40, right: 40, bottom: 64, gap: 10 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden" }}>
        <Animated.View style={{ width: "35%", height: 6, borderRadius: 3, backgroundColor: colors.accent,
          transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-140, 320] }) }] }} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[font(600), { fontSize: 13, textAlign: "center", color: colors.mutedText }]}>{message}</Text>
    </View>
  </View>;
}
