import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemePreference, useAppTheme } from "@/features/settings/themePreference";
import { lightColors, darkColors } from "@/ui/atomTheme";
import { StatusMessage } from "@/ui/StatusMessage";

export const themeLabel = (value: string) => value === "light" ? "Светлая" : value === "dark" ? "Тёмная" : "Как на телефоне";
export function ThemeOptions() {
  const { colors, preference, setPreference } = useAppTheme();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function choose(value: ThemePreference) { if (busy.current) return; busy.current = true; setError(null); try { await setPreference(value); } catch { setError("Не удалось сохранить оформление. Повторите выбор."); } finally { busy.current = false; } }
  return <View style={{ gap: 12 }}>{error ? <StatusMessage tone="danger" message={error} /> : null}{(["system", "light", "dark"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={themeLabel(value)} accessibilityState={{ checked: preference === value }} onPress={() => void choose(value)} style={{ borderWidth: 1, borderColor: preference === value ? colors.primary : colors.border, borderRadius: 14, padding: 16, gap: 12, minHeight: 48 }}>
    <View style={{ flexDirection: "row", gap: 12 }}><View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{themeLabel(value)}</Text><Text style={{ fontSize: 14, lineHeight: 20, color: colors.mutedText }}>{value === "system" ? "Использовать настройки системы" : `Всегда использовать ${value === "light" ? "светлую" : "тёмную"} тему`}</Text></View><Ionicons name={preference === value ? "radio-button-on" : "radio-button-off"} size={24} color={preference === value ? colors.primary : colors.mutedText} /></View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 16 }}>{(value === "system" ? [lightColors, darkColors] : value === "light" ? [lightColors] : [darkColors]).map((palette, index) => <View key={index} style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: "hidden", width: 80, height: 36 }}><View style={{ flex: 1, backgroundColor: palette.background }} /><View style={{ flex: 1, backgroundColor: palette.backgroundAccent }} /></View>)}</View>
  </Pressable>)}</View>;
}
export function ThemePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useAppTheme(); const insets = useSafeAreaInsets();
  return <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim }}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор оформления" onPress={onClose} style={{ flex: 1 }} /><View accessibilityViewIsModal style={{ maxHeight: "90%", backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: Math.max(18, insets.bottom) }}><View style={{ width: 48, height: 4, borderRadius: 4, backgroundColor: colors.border, alignSelf: "center", marginBottom: 18 }} /><ScrollView contentContainerStyle={{ gap: 20 }}><Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>Выбор оформления</Text><ThemeOptions /></ScrollView></View></View></Modal>;
}
