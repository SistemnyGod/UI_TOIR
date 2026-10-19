import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { softShadow } from "@/ui/typography";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const { colors } = useAppTheme();

  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, softShadow(colors.shadow, 1), style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderColor: "#dbe5f2",
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 16,
  }
});
