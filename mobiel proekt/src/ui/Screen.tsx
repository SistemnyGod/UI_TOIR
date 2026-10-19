import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { ReactNode, type Ref } from "react";
import {
  Pressable,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  FlatListProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";
import { NavigationBar, navigationItems, useKeyboardVisible } from "./NavigationBar";
import { useConnectionStatus } from "@/core/connectionStatus";
import { useStableListAnchor } from './useStableListAnchor';
import { ClockSkewNotice } from './ClockSkewNotice';
import { BrandLogo } from './BrandMark';
import { font, softShadow } from './typography';

type ScreenProps = {
  title: string;
  onBack?: () => void;
  compactHeader?: boolean;
  subtitle?: string;
  children: ReactNode;
  floatingNotice?: ReactNode;
  bottomAction?: ReactNode;
  bottomActionBackground?: 'surface' | 'transparent';
  plainBackground?: boolean;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

type ScreenListProps<T> = Omit<FlatListProps<T>, "ListHeaderComponent" | "contentContainerStyle"> & {
  onBack?: () => void;
  listRef?: Ref<FlatList<T>>;
  title: string;
  compactHeader?: boolean;
  subtitle?: string;
  bottomAction?: ReactNode;
  headerContent?: ReactNode;
  floatingNotice?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({ title, subtitle, children, floatingNotice, bottomAction, bottomActionBackground = 'surface', plainBackground = false, scroll = true, compactHeader = false, onBack, contentContainerStyle }: ScreenProps) {
  const shell = useScreenShell();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: shell.colors.background }]}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {plainBackground ? null : <ScreenBackground />}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 24 },
            contentContainerStyle
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader onBack={onBack} compact={compactHeader} title={title} subtitle={subtitle} networkStatus={shell.networkStatus} />
          {children}
        </ScrollView>
      ) : (
        <View style={styles.nonScrollingContent}>
          <View style={styles.nonScrollingHeader}><ScreenHeader onBack={onBack} compact={compactHeader} title={title} subtitle={subtitle} networkStatus={shell.networkStatus} /></View>
          {children}
        </View>
      )}
      {floatingNotice ? <View pointerEvents="box-none" style={{ flexShrink: 0, paddingHorizontal: 16 }}>{floatingNotice}</View> : null}
      <View style={{ flexShrink: 0, backgroundColor: bottomActionBackground === 'transparent' ? 'transparent' : shell.colors.background }}>
        {bottomAction ? <View style={{ padding: 16, paddingBottom: shell.showNestedNavigation && !shell.keyboard ? 12 : Math.max(shell.insets.bottom, 12) }}>{bottomAction}</View> : null}
        <NestedNavigation shell={shell} />
      </View>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

export function ScreenList<T>({
  listRef,
  onBack,
  compactHeader = false,
  title,
  subtitle,
  headerContent,
  floatingNotice,
  bottomAction,
  contentContainerStyle,
  ...listProps
}: ScreenListProps<T>) {
  const shell = useScreenShell();
  const stableAnchor = useStableListAnchor(Array.from(listProps.data ?? []).map((item, index) => listProps.keyExtractor?.(item, index) ?? String(index)));

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: shell.colors.background }]}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenBackground />
      <FlatList
        ref={listRef}
        {...listProps}
        maintainVisibleContentPosition={stableAnchor ? listProps.maintainVisibleContentPosition : undefined}
        style={[{ flex: 1 }, listProps.style]}
        contentContainerStyle={[
          styles.content,
          contentContainerStyle,
          { paddingBottom: 24 }
        ]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ScreenHeader onBack={onBack} compact={compactHeader} title={title} subtitle={subtitle} networkStatus={shell.networkStatus} />
            {headerContent}
          </View>
        }
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
      />
      {floatingNotice ? <View pointerEvents="box-none" style={{ flexShrink: 0, paddingHorizontal: 16 }}>{floatingNotice}</View> : null}
      <View style={{ flexShrink: 0, backgroundColor: shell.colors.background }}>
        {bottomAction ? <View style={{ padding: 16, paddingBottom: shell.showNestedNavigation && !shell.keyboard ? 12 : Math.max(shell.insets.bottom, 12) }}>{bottomAction}</View> : null}
        <NestedNavigation shell={shell} />
      </View>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

function useScreenShell() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const networkStatus = useConnectionStatus();
  const keyboard = useKeyboardVisible();
  const showNestedNavigation =
    pathname.startsWith("/patrol/") || pathname.startsWith("/camera/") || pathname === "/settings" || pathname.startsWith("/settings/");
  const bottomInset = Math.max(insets.bottom, 8);


  return { bottomInset, colors, insets, keyboard, networkStatus, pathname, router, showNestedNavigation };
}

function ScreenBackground() {
  const { colors } = useAppTheme();

  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <View style={[styles.topWash, { backgroundColor: colors.header }]} />
      <View style={[styles.topWashFade, { backgroundColor: colors.header }]} />
      <View style={[styles.topGlow, { backgroundColor: colors.brand }]} />
    </View>
  );
}

type NetworkStatus = "offline" | "checking" | "connected" | "serverUnavailable" | "otherServer" | "authorizationRequired";

function ScreenHeader({ title, subtitle, networkStatus, compact = false, onBack }: { title: string; subtitle?: string; networkStatus: NetworkStatus; compact?: boolean; onBack?: () => void }) {
  const { colors } = useAppTheme();

  if (onBack) return <><View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={onBack} hitSlop={4}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, transform: [{ scale: pressed ? 0.94 : 1 }] }, softShadow(colors.shadow, 1)]}>
      <Ionicons name="chevron-back" size={22} color={colors.text} />
    </Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text accessibilityRole="header" style={[font(800), { color: colors.text, fontSize: 21, lineHeight: 27, letterSpacing: -0.3 }]}>{title}</Text>
      {subtitle ? <Text style={[font(600), { color: colors.mutedText, fontSize: 13, lineHeight: 18 }]}>{subtitle}</Text> : null}
    </View>
  </View><ClockSkewNotice /></>;
  return (
    <>
      <View style={styles.topBar}>
        <BrandLogo size={30} />
        <View style={[styles.networkBadge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.networkDot, { backgroundColor: networkStatus === "connected" ? colors.success : networkStatus === "checking" ? colors.warning : networkStatus === "offline" ? colors.mutedText : colors.danger }]} />
          <Text style={[styles.networkText, font(700), { color: colors.mutedText }]}>{networkStatusLabel(networkStatus)}</Text>
        </View>
      </View>
      <ClockSkewNotice />
      {title || subtitle ? <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, font(800), { color: colors.text }, compact ? { fontSize: 23, lineHeight: 29 } : null]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, font(600), { color: colors.mutedText }]}>{subtitle}</Text> : null}
      </View> : null}
    </>
  );
}

function networkStatusLabel(status: NetworkStatus) {
  if (status === "connected") return "На связи";
  if (status === "serverUnavailable") return "Сервер недоступен";
  if (status === "authorizationRequired") return "Нужен вход";
  if (status === "otherServer") return "Другой сервер";
  if (status === "checking") return "Проверяем";
  return "Офлайн";
}

function NestedNavigation({ shell }: { shell: ReturnType<typeof useScreenShell> }) {
  if (!shell.showNestedNavigation || shell.keyboard) return null;
  const active = shell.pathname.startsWith("/settings") || shell.pathname.startsWith("/profile") ? "profile"
    : shell.pathname.startsWith("/reports") ? "reports" : shell.pathname.startsWith("/work-accounting") ? "work-accounting" : "patrol";
  return <NavigationBar active={active} onSelect={name => {
    const item = navigationItems.find(tab => tab.name === name)!;
    shell.router.replace(item.path as never);
  }} />;
}
const styles = StyleSheet.create({
  bottomAction: {
    bottom: 0,
    left: 16,
    position: "absolute",
    right: 16,
    zIndex: 20
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fa"
  },
  backgroundLayer: {
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0
  },
  topWash: {
    height: 120,
    width: "100%"
  },
  topWashFade: {
    height: 80,
    opacity: 0.45,
    width: "100%"
  },
  topGlow: {
    borderRadius: 999,
    height: 240,
    opacity: 0.08,
    position: "absolute",
    right: -80,
    top: -110,
    width: 240
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 28
  },
  nonScrollingContent: { flex: 1 },
  nonScrollingHeader: { paddingHorizontal: 16, paddingTop: 16 },
  listHeader: {
    gap: 10
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#1e5bff",
    borderRadius: 9,
    height: 34,
    justifyContent: "center",
    shadowColor: "#1e5bff",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: 34
  },
  brandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  brandText: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 12
  },
  networkBadge: {
    flexShrink: 1,
    marginLeft: 16,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  networkDot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  networkText: {
    flexShrink: 1,
    fontSize: 13
  },
  header: {
    gap: 6
  },
  title: {
    color: "#0f1a2b",
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 36
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20
  },
  nestedNav: {
    alignItems: "center",
    borderTopWidth: 1,
    bottom: 0,
    elevation: 16,
    flexDirection: "row",
    justifyContent: "space-around",
    left: 0,
    paddingTop: 8,
    position: "absolute",
    right: 0,
    shadowColor: "#0f1a2b",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 14
  },
  nestedNavItem: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    justifyContent: "center",
    marginHorizontal: 3,
    minHeight: 56,
    overflow: "hidden"
  },
  nestedNavItemPressed: {
    opacity: 0.82
  },
  nestedNavActiveBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16
  },
  nestedNavContent: {
    alignItems: "center",
    gap: 3,
    justifyContent: "center",
    zIndex: 1
  },
  nestedNavLabel: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12
  }
});
