import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";

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
  const content = (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={[
        styles.track,
        scrollable ? styles.scrollTrack : styles.fixedTrack,
        { backgroundColor: colors.backgroundAccent, borderColor: colors.border }
      ]}
    >
      {items.map((item) => (
        <SelectionTabButton
          compact={compact}
          key={item.value}
          item={item}
          onPress={() => onChange(item.value)}
          selected={item.value === value}
          stretch={!scrollable}
        />
      ))}
    </View>
  );

  if (!scrollable) {
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
  stretch
}: {
  compact: boolean;
  item: SelectionTab<T>;
  onPress: () => void;
  selected: boolean;
  stretch: boolean;
}) {
  const { colors } = useAppTheme();
  const [selectedProgress] = useState(() => new Animated.Value(selected ? 1 : 0));

  useEffect(() => {
    Animated.timing(selectedProgress, {
      duration: 150,
      toValue: selected ? 1 : 0,
      useNativeDriver: true
    }).start();
  }, [selected, selectedProgress]);

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
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.selectedBackground, { backgroundColor: colors.card }, animatedStyle]}
      />
      <View style={styles.labelRow}>
        {item.icon ? (
          <Ionicons color={selected ? colors.primary : colors.mutedText} name={item.icon} size={compact ? 17 : 18} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            compact ? styles.labelCompact : null,
            { color: selected ? colors.primary : colors.mutedText }
          ]}
        >
          {item.label}
        </Text>
        {typeof item.count === "number" ? (
          <View style={[styles.countBadge, { backgroundColor: selected ? colors.primary : colors.border }]}>
            <Text style={[styles.countText, { color: selected ? "#ffffff" : colors.text }]}>{item.count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SelectionTransition({ children, selectionKey }: { children: ReactNode; selectionKey: string }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    opacity.setValue(0.68);
    translateY.setValue(4);
    Animated.parallel([
      Animated.timing(opacity, { duration: 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 150, toValue: 0, useNativeDriver: true })
    ]).start();
  }, [opacity, selectionKey, translateY]);

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
    minHeight: 44,
    paddingHorizontal: 10
  },
  buttonStretch: {
    flex: 1
  },
  buttonPressed: {
    opacity: 0.82
  },
  selectedBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#0f1a2b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    zIndex: 1
  },
  label: {
    fontSize: 13,
    fontWeight: "800"
  },
  labelCompact: {
    fontSize: 12
  },
  countBadge: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 6
  },
  countText: {
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  }
});
