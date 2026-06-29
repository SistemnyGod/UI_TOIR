import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const { colors } = useAppTheme();

  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderColor: "#dbe5f2",
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 15,
    shadowColor: "#0f1a2b",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3
  }
});
