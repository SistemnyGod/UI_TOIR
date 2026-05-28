import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";

const tabIcon = (name: keyof typeof Ionicons.glyphMap) =>
  function Icon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons color={String(color)} name={name} size={size} />;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const bottomInset = Math.max(insets.bottom, 38);
  const tabBarHeight = 66 + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarIconStyle: {
          marginTop: 2
        },
        tabBarItemStyle: {
          paddingTop: 4
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2
        },
        tabBarStyle: {
          backgroundColor: colors.navBackground,
          borderTopColor: colors.navBorder,
          borderTopWidth: 1,
          elevation: 16,
          height: tabBarHeight,
          paddingBottom: bottomInset + 6,
          paddingTop: 7,
          shadowColor: "#0f1a2b",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 14
        }
      }}
    >
      <Tabs.Screen name="patrol" options={{ title: "Обход", tabBarIcon: tabIcon("shield-checkmark-outline") }} />
      <Tabs.Screen name="all-points" options={{ title: "Метки", tabBarIcon: tabIcon("list-outline") }} />
      <Tabs.Screen name="work-accounting" options={{ title: "Работы", tabBarIcon: tabIcon("construct-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: tabIcon("person-circle-outline") }} />
    </Tabs>
  );
}
