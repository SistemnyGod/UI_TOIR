import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";

import { useReducedMotion } from "@/ui/useReducedMotion";

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Soft entrance: rises a few pixels and fades in; staggered by `index`. Static when reduced motion is on. */
export function Rise({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const entering = reduced ? undefined : FadeInDown.duration(460).delay(Math.min(index, 10) * 45).easing(ease).withInitialValues({ transform: [{ translateY: 12 }] });
  return <Animated.View entering={entering} layout={reduced ? undefined : LinearTransition.duration(220)} style={style}>{children}</Animated.View>;
}

/** Plain fade for overlays and status changes. */
export function Fade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={style}>{children}</Animated.View>;
}
