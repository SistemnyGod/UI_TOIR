import { navigateAfterFormSave } from "@/services/formNavigationGuard";
import { Tabs } from "expo-router";
import { NavigationBar, navigationItems } from "@/ui/NavigationBar";
import { unreadBadgeLabel, useUnreadNotificationCount } from "@/features/profile/useUnreadNotificationCount";

export default function TabsLayout() {
  const unread = useUnreadNotificationCount(); const unreadLabel = unreadBadgeLabel(unread);
  return <Tabs detachInactiveScreens={false} screenOptions={{ headerShown: false, lazy: true, animation: "shift", transitionSpec: { animation: "timing", config: { duration: 220 } }, tabBarHideOnKeyboard: true }}
    tabBar={({ state, navigation }) => <NavigationBar active={state.routes[state.index].name} badges={{ profile: unreadLabel ? { label: unreadLabel, accessibilityLabel: `${unread} непрочитанных уведомлений` } : null }} onSelect={name => {
      const route = state.routes.find(item => item.name === name);
      if (!route) return;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented && state.routes[state.index].key !== route.key) navigateAfterFormSave(() => navigation.navigate(route.name, route.params));
    }} />}>
    {navigationItems.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />)}
    <Tabs.Screen name="all-points" options={{ href: null }} />
  </Tabs>;
}
