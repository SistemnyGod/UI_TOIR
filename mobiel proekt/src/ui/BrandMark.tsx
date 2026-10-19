import { Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

import { useAppTheme } from "@/features/settings/themePreference";
import { darkColors } from "@/ui/atomTheme";
import { font } from "@/ui/typography";

/** Hexagon faces (top, left, right) per surface: brand blues on app surfaces, white on blue heroes. */
const faces = {
  light: { top: "#1fb5ee", left: "#1846d8", right: "#1d6fe6" },
  dark: { top: "#4cc7ff", left: "#2f62f5", right: "#3a8af8" },
  onBlue: { top: "#ffffff", left: "rgba(255,255,255,0.95)", right: "#dbe7ff" }
} as const;

/** ATOM Minerals mark: a faceted hexagonal crystal with an atom orbit, as in the approved logo. */
export function BrandMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  const { colors } = useAppTheme();
  const face = light ? faces.onBlue : colors.background === darkColors.background ? faces.dark : faces.light;
  const ink = light ? colors.accent : "#ffffff";
  return <View accessible={false} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M16 1.5L28.5 8.75V23.25L16 30.5L3.5 23.25V8.75Z" fill={face.left} />
      <Path d="M16 1.5L28.5 8.75L16 16L3.5 8.75Z" fill={face.top} />
      <Path d="M16 16L28.5 8.75V23.25L16 30.5Z" fill={face.right} />
      <G opacity={light ? 1 : 0.9}>
        <Ellipse cx="16" cy="16" rx="11" ry="4.2" fill="none" stroke={ink} strokeWidth={light ? 1.3 : 1.4} transform="rotate(-30 16 16)" />
        <Circle cx="25.5" cy="10.5" r="1.6" fill={ink} />
      </G>
      <Circle cx="16" cy="16" r="2.8" fill={ink} />
      {light ? null : <Circle cx="11" cy="7.5" r="1.1" fill="#ffffff" opacity={0.7} />}
    </Svg>
  </View>;
}

export function BrandLogo({ size = 32, light = false, large = false }: { size?: number; light?: boolean; large?: boolean }) {
  const { colors } = useAppTheme();
  const word = light ? "#ffffff" : colors.text;
  const sub = light ? "rgba(255,255,255,0.85)" : colors.brand;
  return <View accessible accessibilityRole="image" accessibilityLabel="ATOM Minerals" style={{ flexDirection: large ? "column" : "row", alignItems: "center", gap: large ? 16 : 9 }}>
    <BrandMark size={size} light={light} />
    <View style={{ alignItems: large ? "center" : "flex-start" }}>
      <Text style={[font(800), { fontSize: large ? 38 : 18, lineHeight: large ? 44 : 20, letterSpacing: large ? 6 : 2.2, color: word }]}>ATOM</Text>
      <Text style={[font(700), { fontSize: large ? 12 : 8, lineHeight: large ? 16 : 10, letterSpacing: large ? 7 : 3.4, color: sub }]}>MINERALS</Text>
    </View>
  </View>;
}
