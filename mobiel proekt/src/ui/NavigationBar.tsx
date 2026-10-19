import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/features/settings/themePreference";
import { font, softShadow } from "@/ui/typography";

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
export type NavigationBadges = Partial<Record<typeof navigationItems[number]["name"], { label: string; accessibilityLabel: string } | null>>;
/** Floating pill bar: the active tab gets a filled icon pill, labels stay readable at large font scales. */
export function NavigationBar({ active, onSelect, badges }: { active: string; onSelect: (name: typeof navigationItems[number]["name"]) => void; badges?: NavigationBadges }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  if (keyboard) return null;
  return <View style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.background }}>
    <View style={[{ flexDirection: "row", flexWrap: largeText ? "wrap" : "nowrap", padding: 4, borderRadius: 24, borderWidth: 1, borderColor: colors.navBorder, backgroundColor: colors.navBackground }, softShadow(colors.shadow, 2)]}>
      {navigationItems.map(item => {
        const badge = badges?.[item.name];
        const selected = active === item.name;
        return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={badge ? `${item.label}, ${badge.accessibilityLabel}` : item.label}
          accessibilityState={{ selected }} onPress={() => onSelect(item.name)}
          style={({ pressed }) => ({ flex: largeText ? undefined : 1, width: largeText ? "50%" : undefined, flexDirection: largeText ? "row" : "column", minWidth: 0, minHeight: 54, alignItems: "center", justifyContent: "center",
            paddingVertical: 5, paddingHorizontal: 2, gap: 3, borderRadius: 20, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <View style={{ width: 52, height: 32, alignItems: "center", justifyContent: "center" }}>
            {/* Always mounted so Android keeps the rounded clip; only opacity changes on selection. */}
            <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 52, height: 32, borderRadius: 16, overflow: "hidden", backgroundColor: colors.accent, opacity: selected ? 1 : 0 }} />
            <Ionicons size={21} name={selected ? item.activeIcon : item.icon} color={selected ? colors.onAccent : colors.mutedText} />
            {badge ? <View style={{ position: "absolute", top: -5, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerFill, borderWidth: 2, borderColor: colors.navBackground }}>
              <Text style={[font(800), { fontSize: 10, lineHeight: 13, color: colors.onAccent }]}>{badge.label}</Text>
            </View> : null}
          </View>
          <Text style={[font(selected ? 800 : 700), { flexShrink: 1, fontSize: 12, lineHeight: 16, textAlign: "center", color: selected ? colors.primary : colors.mutedText }]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
