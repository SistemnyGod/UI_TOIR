import NetInfo from "@react-native-community/netinfo";
import { ReactNode, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";

type ScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Screen({ title, subtitle, children }: ScreenProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return unsubscribe;
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={[styles.topWash, { backgroundColor: colors.backgroundAccent }]} />
        <View style={[styles.headerLine, { backgroundColor: colors.border }]} />
        <View style={[styles.sidePanel, { borderColor: colors.border }]} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 132, 152) }]}
        showsVerticalScrollIndicator={false}
      >
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
        {children}
      </ScrollView>
    </SafeAreaView>
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
    height: 188,
    opacity: 0.95,
    width: "100%"
  },
  headerLine: {
    height: 1,
    opacity: 0.75,
    width: "100%"
  },
  sidePanel: {
    borderRadius: 32,
    borderWidth: 1,
    height: 220,
    opacity: 0.35,
    position: "absolute",
    right: -110,
    top: 48,
    transform: [{ rotate: "-10deg" }],
    width: 260
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 28
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
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32
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
    fontSize: 28,
    fontWeight: "600"
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 22
  }
});
