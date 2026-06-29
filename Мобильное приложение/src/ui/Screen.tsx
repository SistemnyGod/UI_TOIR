import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ColorValue,
  FlatList,
  FlatListProps,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";

type ScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type ScreenListProps<T> = Omit<FlatListProps<T>, "ListHeaderComponent" | "contentContainerStyle"> & {
  title: string;
  subtitle?: string;
  headerContent?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({ title, subtitle, children }: ScreenProps) {
  const shell = useScreenShell();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: shell.colors.background }]}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: shell.showNestedNavigation ? 132 + shell.bottomInset : Math.max(shell.insets.bottom + 150, 172) }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={title} subtitle={subtitle} isOnline={shell.isOnline} />
        {children}
      </ScrollView>
      <NestedNavigation shell={shell} />
    </SafeAreaView>
  );
}

export function ScreenList<T>({
  title,
  subtitle,
  headerContent,
  contentContainerStyle,
  ...listProps
}: ScreenListProps<T>) {
  const shell = useScreenShell();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: shell.colors.background }]}>
      <ScreenBackground />
      <FlatList
        {...listProps}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: shell.showNestedNavigation ? 132 + shell.bottomInset : Math.max(shell.insets.bottom + 150, 172) },
          contentContainerStyle
        ]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ScreenHeader title={title} subtitle={subtitle} isOnline={shell.isOnline} />
            {headerContent}
          </View>
        }
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
      <NestedNavigation shell={shell} />
    </SafeAreaView>
  );
}

function useScreenShell() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const assignmentId = useMemo(() => pathname.match(/^\/patrol\/assignment\/([^/]+)/)?.[1] ?? null, [pathname]);
  const showNestedNavigation =
    pathname.startsWith("/patrol/") || pathname.startsWith("/camera/") || pathname === "/settings" || pathname.startsWith("/settings/");
  const bottomInset = Math.max(insets.bottom, 34);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return unsubscribe;
  }, []);

  return { assignmentId, bottomInset, colors, insets, isOnline, pathname, router, showNestedNavigation };
}

function ScreenBackground() {
  const { colors } = useAppTheme();

  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <View style={[styles.topWash, { backgroundColor: colors.backgroundAccent }]} />
      <View style={[styles.headerLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

function ScreenHeader({ title, subtitle, isOnline }: { title: string; subtitle?: string; isOnline: boolean }) {
  const { colors } = useAppTheme();

  return (
    <>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>AM</Text>
          </View>
          <Text style={[styles.brandText, { color: colors.text }]}>ATOM{"\n"}MINERALS</Text>
        </View>
        <View style={styles.networkBadge}>
          <Text style={[styles.networkText, { color: colors.mutedText }]}>{isOnline ? "Онлайн" : "Оффлайн"}</Text>
          <View style={[styles.networkDot, { backgroundColor: isOnline ? "#22c55e" : "#f59e0b" }]} />
        </View>
      </View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.mutedText }]}>{subtitle}</Text> : null}
      </View>
    </>
  );
}

function NestedNavigation({ shell }: { shell: ReturnType<typeof useScreenShell> }) {
  const { assignmentId, bottomInset, colors, pathname, router, showNestedNavigation } = shell;

  if (!showNestedNavigation) {
    return null;
  }

  return (
    <View
      style={[
        styles.nestedNav,
        {
          backgroundColor: colors.navBackground,
          borderTopColor: colors.navBorder,
          height: 72 + bottomInset,
          paddingBottom: bottomInset + 8
        }
      ]}
    >
      <NestedNavItem
        active={pathname.startsWith("/patrol") && !pathname.includes("/all-points")}
        icon="shield-checkmark-outline"
        label="Обход"
        onPress={() => router.replace("/patrol")}
      />
      <NestedNavItem
        active={pathname.includes("/all-points")}
        icon="list-outline"
        label="Метки"
        onPress={() => router.replace(assignmentId ? `/patrol/assignment/${assignmentId}/all-points` : "/all-points")}
      />
      <NestedNavItem
        active={pathname.startsWith("/work-accounting")}
        icon="construct-outline"
        label="Работы"
        onPress={() => router.replace("/work-accounting")}
      />
      <NestedNavItem
        active={pathname.startsWith("/profile") || pathname.startsWith("/settings")}
        icon="person-circle-outline"
        label="Профиль"
        onPress={() => router.replace("/profile")}
      />
    </View>
  );
}

function NestedNavItem({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const color: ColorValue = active ? colors.primary : colors.mutedText;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.nestedNavItem}>
      <Ionicons color={String(color)} name={icon} size={24} />
      <Text style={[styles.nestedNavLabel, { color: String(color) }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    height: 152,
    opacity: 0.5,
    width: "100%"
  },
  headerLine: {
    height: 1,
    opacity: 0.55,
    width: "100%"
  },
  content: {
    gap: 13,
    padding: 16,
    paddingBottom: 28
  },
  listHeader: {
    gap: 13
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
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  networkDot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  networkText: {
    fontSize: 12,
    fontWeight: "700"
  },
  header: {
    gap: 6
  },
  title: {
    color: "#0f1a2b",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 31
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
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 56
  },
  nestedNavLabel: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12
  }
});
