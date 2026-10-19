import { LinearGradient } from "expo-linear-gradient";
import type { StyleProp, ViewStyle } from "react-native";

import { darkColors, type ThemeColors } from "@/ui/atomTheme";

export type GradientKind = "accent" | "hero" | "success" | "danger" | "warning" | "header" | "progress";

type Stops = readonly [string, string, ...string[]];

/** Gradient stops from the approved mockups; diagonal fills run 135°, washes run top to bottom. */
const palettes: Record<"light" | "dark", Record<GradientKind, Stops>> = {
  light: {
    accent: ["#2f6bff", "#1846d8"],
    hero: ["#2f6bff", "#1f52f0", "#1640c8"],
    success: ["#2bb06c", "#167044"],
    danger: ["#ec5a70", "#b42336"],
    warning: ["#f5b33d", "#d08200"],
    header: ["#e3edff", "#eef4ff", "#f4f7fb"],
    progress: ["#1d9a5c", "#33b977"]
  },
  dark: {
    accent: ["#4a82ff", "#2f62f5"],
    hero: ["#3f7bff", "#2a56e8", "#1f43c4"],
    success: ["#3ccf8e", "#1f9a5c"],
    danger: ["#ff7a8f", "#d63c55"],
    warning: ["#ffbf55", "#e08e10"],
    header: ["#143a72", "#0c2649", "#071426"],
    progress: ["#3ccf8e", "#7fe0ae"]
  }
};

const directions: Record<GradientKind, { start: { x: number; y: number }; end: { x: number; y: number } }> = {
  accent: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  hero: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  success: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  danger: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  warning: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  header: { start: { x: 0.2, y: 0 }, end: { x: 0.5, y: 1 } },
  progress: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } }
};

/** Theme is detected from the background token, so partial colour mocks in tests fall back to light. */
export function gradientStops(colors: Pick<ThemeColors, "background">, kind: GradientKind): Stops {
  return palettes[colors.background === darkColors.background ? "dark" : "light"][kind];
}

const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 } as const;

/** Absolutely positioned gradient layer; place it first inside a view with the same border radius. */
export function GradientFill({ colors, kind, radius = 0, style }: {
  colors: Pick<ThemeColors, "background">;
  kind: GradientKind;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { start, end } = directions[kind];
  return <LinearGradient pointerEvents="none" colors={gradientStops(colors, kind)} start={start} end={end} style={[fill, { borderRadius: radius }, style]} />;
}
