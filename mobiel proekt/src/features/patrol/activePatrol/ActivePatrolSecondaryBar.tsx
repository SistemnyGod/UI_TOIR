import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ActivePatrolView } from "@/features/patrol/activePatrol/activePatrolPresentation";
import { useAppTheme } from "@/features/settings/themePreference";

type Props = {
  view: ActivePatrolView;
  onOpenPoints: () => void;
  onReviewReport: () => void;
  onOpenMenu: () => void;
};

/** Links to all points and the report review, plus the button that opens the patrol action menu. */
export function ActivePatrolSecondaryBar({ view, onOpenPoints, onReviewReport, onOpenMenu }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.secondaryBar}>
      {!view.isCompletedServer && !view.isBlocked ? (
        <Pressable accessibilityRole="button" onPress={onOpenPoints} style={styles.linkButton}>
          <Ionicons color={colors.primary} name="list-outline" size={19} />
          <Text style={[styles.linkLabel, { color: colors.primary }]}>Все метки</Text>
        </Pressable>
      ) : <View />}
      {view.isReadyForReview && !view.isCompletedLocal && !view.isCompletedServer ? (
        <Pressable accessibilityRole="button" onPress={onReviewReport} style={styles.linkButton}>
          <Ionicons color={colors.primary} name="document-text-outline" size={19} />
          <Text style={[styles.linkLabel, { color: colors.primary }]}>Проверить отчёт</Text>
        </Pressable>
      ) : null}
      {view.isInProgress ? (
        <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={onOpenMenu} style={[styles.iconButton, { borderColor: colors.border }]}>
          <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  secondaryBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  linkButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  linkLabel: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  }
});
