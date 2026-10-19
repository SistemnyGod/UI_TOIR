import { useReducedMotion } from "./useReducedMotion";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";
import { font } from "@/ui/typography";

export type ActionSheetItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionSheet({
  actions,
  onClose,
  title,
  message,
  visible
}: {
  actions: ActionSheetItem[];
  onClose: () => void;
  title: string;
  message?: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityLabel="Закрыть меню" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityLabel={title} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, font(800), { color: colors.text }]}>{title}</Text>
            <Pressable accessibilityLabel="Закрыть" accessibilityRole="button" hitSlop={8} onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.backgroundAccent }]}>
              <Ionicons color={colors.mutedText} name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.actions}>
            {message ? <Text style={{ color: colors.mutedText, fontSize: 16, lineHeight: 24, marginBottom: 8 }}>{message}</Text> : null}
            {actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                disabled={action.disabled}
                accessibilityState={{ disabled: !!action.disabled }}
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                  pressed && !action.disabled ? { backgroundColor: colors.backgroundAccent } : null,
                  action.disabled ? styles.disabled : null
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: action.danger ? colors.dangerSurface : colors.backgroundAccent }]}>
                  <Ionicons color={action.danger ? colors.danger : colors.primary} name={action.icon} size={21} />
                </View>
                <Text style={[styles.actionLabel, font(800), { color: action.danger ? colors.danger : colors.text }]}>{action.label}</Text>
                <Ionicons color={colors.mutedText} name="chevron-forward" size={18} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    flex: 1,
    justifyContent: "flex-end"
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 5,
    width: 40
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  actions: {
    gap: 8
  },
  action: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionPressed: {
    backgroundColor: "#f8fafc"
  },
  disabled: {
    opacity: 0.45
  },
  iconBox: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21
  }
});
