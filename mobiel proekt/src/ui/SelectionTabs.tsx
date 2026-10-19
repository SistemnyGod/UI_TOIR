import { useReducedMotion } from "./useReducedMotion";
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { onHero } from "@/ui/brandPalette";
import { GradientFill } from "@/ui/GradientFill";
import { font } from "@/ui/typography";

export type SelectionTab<T extends string> = {
  value: T;
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
};

type SelectionTabsProps<T extends string> = {
  accessibilityLabel: string;
  items: readonly SelectionTab<T>[];
  onChange: (value: T) => void;
  value: T;
  compact?: boolean;
  scrollable?: boolean;
};

export function SelectionTabs<T extends string>({
  accessibilityLabel,
  compact = false,
  items,
  onChange,
  scrollable = false,
  value
}: SelectionTabsProps<T>) {
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const horizontal = scrollable;
  const wrapped = !horizontal && (items.length > 3 || fontScale > 1.3);
  const content = (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={[
        styles.track,
        horizontal ? styles.scrollTrack : styles.fixedTrack,
        wrapped ? { flexWrap: "wrap" } : null,
        { backgroundColor: colors.card, borderColor: colors.cardBorder }
      ]}
    >
      {items.map((item) => (
        <SelectionTabButton
          compact={compact}
          key={item.value}
          item={item}
          onPress={() => onChange(item.value)}
          selected={item.value === value}
          stretch={!horizontal && !wrapped}
          wrapWidth={wrapped ? (fontScale > 1.5 ? "100%" : "48%") : undefined}
        />
      ))}
    </View>
  );

  if (!horizontal) {
    return content;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
}

function SelectionTabButton<T extends string>({
  compact,
  item,
  onPress,
  selected,
  stretch,
  wrapWidth
}: {
  compact: boolean;
  item: SelectionTab<T>;
  onPress: () => void;
  selected: boolean;
  stretch: boolean;
  wrapWidth?: "48%" | "100%";
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [selectedProgress] = useState(() => new Animated.Value(selected ? 1 : 0));

  useEffect(() => {
    Animated.timing(selectedProgress, {
      duration: reducedMotion ? 0 : 150,
      toValue: selected ? 1 : 0,
      useNativeDriver: true
    }).start();
  }, [selected, selectedProgress, reducedMotion]);

  const animatedStyle = {
    opacity: selectedProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    }),
    transform: [
      {
        scale: selectedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1]
        })
      }
    ]
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.buttonCompact : styles.buttonRegular,
        stretch ? styles.buttonStretch : null,
        wrapWidth ? { flexBasis: wrapWidth, flexGrow: 1 } : null,
        !stretch ? { maxWidth: width - 48 } : null,
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.selectedBackground, { backgroundColor: colors.accent, shadowColor: colors.accent }, animatedStyle]}
      >
        <GradientFill colors={colors} kind="accent" radius={12} />
      </Animated.View>
      <View style={[styles.labelRow, compact ? styles.labelRowCompact : null, compact && stretch ? styles.stackedLabelRow : null]}>
        {item.icon ? (
          <Ionicons color={selected ? colors.onAccent : colors.mutedText} name={item.icon} size={compact ? 16 : 18} />
        ) : null}
        <Text
          style={[
            styles.label,
            font(800),
            compact ? styles.labelCompact : null,
            { color: selected ? colors.onAccent : colors.mutedText }
          ]}
        >
          {item.label}
        </Text>
        {typeof item.count === "number" ? (
          <View style={[styles.countBadge, { backgroundColor: selected ? onHero.glass : colors.backgroundAccent }]}>
            <Text style={[styles.countText, font(800), compact ? styles.countTextCompact : null, { color: selected ? colors.onAccent : colors.mutedText }]}>{item.count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SelectionTransition({ children, selectionKey }: { children: ReactNode; selectionKey: string }) {
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    opacity.setValue(reducedMotion ? 1 : 0.68);
    translateY.setValue(reducedMotion ? 0 : 4);
    Animated.parallel([
      Animated.timing(opacity, { duration: reducedMotion ? 0 : 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: reducedMotion ? 0 : 150, toValue: 0, useNativeDriver: true })
    ]).start();
  }, [opacity, selectionKey, translateY, reducedMotion]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  fixedTrack: {
    width: "100%"
  },
  scrollTrack: {
    alignSelf: "flex-start"
  },
  scrollContent: {
    paddingRight: 16
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    overflow: "hidden"
  },
  buttonRegular: {
    minHeight: 48,
    paddingHorizontal: 12
  },
  buttonCompact: {
    minHeight: 48,
    paddingHorizontal: 8
  },
  buttonStretch: {
    minWidth: 0,
    flex: 1
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }]
  },
  selectedBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  labelRow: {
    flexWrap: "nowrap",
    justifyContent: "center",
    paddingVertical: 8,
    maxWidth: "100%",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    zIndex: 1
  },
  labelRowCompact: {
    gap: 4,
    paddingVertical: 4
  },
  stackedLabelRow: {
    flexDirection: "column"
  },
  label: {
    flexShrink: 1,
    textAlign: "center",
    fontSize: 14
  },
  labelCompact: {
    fontSize: 13
  },
  countBadge: {
    flexShrink: 0,
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 6
  },
  countText: {
    fontSize: 12,
    lineHeight: 18
  },
  countTextCompact: {
    fontSize: 12,
    lineHeight: 18
  }
});
