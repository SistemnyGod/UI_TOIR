import { Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { font } from "@/ui/typography";

/** ATOM Minerals mark: a faceted crystal tile with an atom orbit, drawn with plain views (no SVG dependency). */
export function BrandMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  const { colors } = useAppTheme();
  const face = light ? "#ffffff" : colors.accent;
  const ink = light ? colors.accent : "#ffffff";
  const s = size / 32;
  return <View accessible={false} style={{ width: size, height: size, borderRadius: 9 * s, backgroundColor: face, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", left: 0, top: 0, right: 0, height: size / 2, backgroundColor: light ? "#ffffff" : colors.brand, opacity: light ? 1 : 0.55 }} />
    <View style={{ position: "absolute", width: 24 * s, height: 9 * s, borderRadius: 12 * s, borderWidth: Math.max(1.2, 1.4 * s), borderColor: ink, transform: [{ rotate: "-30deg" }], opacity: 0.9 }} />
    <View style={{ width: 6 * s, height: 6 * s, borderRadius: 3 * s, backgroundColor: ink }} />
    <View style={{ position: "absolute", right: 5 * s, top: 8 * s, width: 3.2 * s, height: 3.2 * s, borderRadius: 2 * s, backgroundColor: ink }} />
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
