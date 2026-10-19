import type { TextStyle, ViewStyle } from "react-native";

/**
 * Manrope ships one file per weight, and Android ignores fontWeight for custom families,
 * so the family name carries the weight. Until the fonts load, the system font is used.
 */
export const fontFamilies = {
  500: "Manrope_500Medium",
  600: "Manrope_600SemiBold",
  700: "Manrope_700Bold",
  800: "Manrope_800ExtraBold"
} as const;

export type FontWeightKey = keyof typeof fontFamilies;

export function font(weight: FontWeightKey = 600): TextStyle {
  return { fontFamily: fontFamilies[weight] };
}

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, sheet: 28, pill: 999 } as const;

/** Soft, layered elevation; keep cards quiet and lift only primary actions. */
export function softShadow(color: string, level: 1 | 2 | 3 = 1): ViewStyle {
  const presets = {
    1: { shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    2: { shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
    3: { shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
  } as const;
  return { shadowColor: color, ...presets[level] };
}
