import { StyleSheet } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { darkColors, type ThemeColors } from "@/ui/atomTheme";
import { tokens, type DesignTokens } from "@/ui/tokens";

type NamedStyles<T> = StyleSheet.NamedStyles<T>;
export type ThemedStyleFactory<T> = (colors: ThemeColors, tokens: DesignTokens) => T;

/**
 * Declares a theme-aware style factory at module level; the wrapper only gives the object
 * literal StyleSheet typing (so `flexDirection: "row"` keeps its literal type).
 */
export function createThemedStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: ThemeColors, tokens: DesignTokens) => T & NamedStyles<T>
): ThemedStyleFactory<T> {
  return factory;
}

const cache = new WeakMap<ThemedStyleFactory<any>, WeakMap<ThemeColors, unknown>>();

/**
 * Builds the style sheet for the given palette once and reuses it for every component that
 * shares the factory, so switching themes only creates one sheet per factory per theme.
 * Declare factories at module level; an inline arrow would miss the cache on every render.
 */
export function themedStyles<T>(factory: ThemedStyleFactory<T>, colors: ThemeColors): T {
  if (typeof colors !== "object" || colors === null) return factory(colors, tokens);
  let byTheme = cache.get(factory);
  if (!byTheme) {
    byTheme = new WeakMap();
    cache.set(factory, byTheme);
  }
  let sheet = byTheme.get(colors) as T | undefined;
  if (!sheet) {
    sheet = StyleSheet.create(factory(colors, tokens) as NamedStyles<any>) as T;
    byTheme.set(colors, sheet);
  }
  return sheet;
}

/** Theme-aware StyleSheet: `const styles = useThemedStyles(createStyles)`. */
export function useThemedStyles<T>(factory: ThemedStyleFactory<T>): T {
  const { colors } = useAppTheme();
  return themedStyles(factory, colors);
}

/** Dark palette check that tolerates partial colour mocks in tests (they fall back to light). */
export function isDarkTheme(colors: Pick<ThemeColors, "background">) {
  return colors.background === darkColors.background;
}
