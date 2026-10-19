import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/features/settings/themePreference";

export const navigationItems = [
  { name: "patrol", label: "Обход", path: "/patrol", icon: "shield-checkmark-outline", activeIcon: "shield-checkmark" },
  { name: "work-accounting", label: "Работы", path: "/work-accounting", icon: "construct-outline", activeIcon: "construct" },
  { name: "reports", label: "Отчёты", path: "/reports", icon: "document-text-outline", activeIcon: "document-text" },
  { name: "profile", label: "Профиль", path: "/profile", icon: "person-circle-outline", activeIcon: "person-circle" }
] as const;
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}
export function NavigationBar({ active, onSelect }: { active: string; onSelect: (name: typeof navigationItems[number]["name"]) => void }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  if (keyboard) return null;
  return <View style={{ flexDirection: "row", flexWrap: largeText ? "wrap" : "nowrap", paddingHorizontal: 4, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8),
    borderTopWidth: 1, borderTopColor: colors.navBorder, backgroundColor: colors.navBackground }}>
    {navigationItems.map(item => <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label}
      accessibilityState={{ selected: active === item.name }} onPress={() => onSelect(item.name)}
      style={({ pressed }) => ({ flex: largeText ? undefined : 1, width: largeText ? "50%" : undefined, flexDirection: largeText ? "row" : "column", minWidth: 0, minHeight: 56, alignItems: "center", justifyContent: "center",
        paddingVertical: 8, paddingHorizontal: 2, gap: 4, borderRadius: 12, opacity: pressed ? 0.75 : 1,
        backgroundColor: active === item.name ? colors.backgroundAccent : "transparent" })}>
      <Ionicons size={24} name={active === item.name ? item.activeIcon : item.icon} color={active === item.name ? colors.primary : colors.mutedText} />
      <Text style={{ flexShrink: 1, fontSize: 14, lineHeight: 20, textAlign: "center", fontWeight: "600", color: active === item.name ? colors.primary : colors.mutedText }}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
