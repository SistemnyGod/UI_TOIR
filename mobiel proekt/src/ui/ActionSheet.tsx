import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/settings/themePreference";

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
  visible
}: {
  actions: ActionSheetItem[];
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Закрыть меню" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityLabel={title} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable accessibilityLabel="Закрыть" accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <Ionicons color={colors.mutedText} name="close" size={22} />
            </Pressable>
          </View>
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                disabled={action.disabled}
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  { borderColor: colors.border },
                  pressed && !action.disabled ? styles.actionPressed : null,
                  action.disabled ? styles.disabled : null
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: action.danger ? "#fef2f2" : "#eef4ff" }]}>
                  <Ionicons color={action.danger ? "#dc2626" : colors.primary} name={action.icon} size={21} />
                </View>
                <Text style={[styles.actionLabel, { color: action.danger ? "#dc2626" : colors.text }]}>{action.label}</Text>
                <Ionicons color={colors.mutedText} name="chevron-forward" size={18} />
              </Pressable>
            ))}
          </View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24
  },
  closeButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48
  },
  actions: {
    gap: 8
  },
  action: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
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
    borderRadius: 10,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  }
});
