import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { StatusTone, toneColors } from "./atomTheme";

export function StatusMessage({ message, tone = "neutral" }: { message: string; tone?: StatusTone }) {
  const { colors } = useAppTheme();
  const palette = toneColors(colors, tone);
  return <View accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
    style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, backgroundColor: palette.background }}>
    <Ionicons color={palette.foreground} size={22} name={tone === "danger" ? "alert-circle-outline" : tone === "success" ? "checkmark-circle-outline" : "information-circle-outline"} />
    <Text style={{ flex: 1, color: palette.foreground, fontSize: 16, lineHeight: 24 }}>{message}</Text>
  </View>;
}
