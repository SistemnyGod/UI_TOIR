import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { softShadow } from "@/ui/typography";
import { createThemedStyles, useThemedStyles } from "@/ui/useThemedStyles";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const styles = useThemedStyles(createStyles);

  return <View style={[styles.card, style]}>{children}</View>;
}

const createStyles = createThemedStyles((colors, { spacing }) => ({
  card: {
    gap: spacing.md,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: spacing.lg,
    ...softShadow(colors.shadow, 1)
  }
}));
