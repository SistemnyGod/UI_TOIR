import { expect, it, vi } from 'vitest';

import { darkColors, lightColors } from '@/ui/atomTheme';
import { tokens } from '@/ui/tokens';
import { createThemedStyles, isDarkTheme, themedStyles } from '@/ui/useThemedStyles';

const { create } = vi.hoisted(() => ({ create: vi.fn((s: unknown) => s) }));
vi.mock('react-native', () => ({ StyleSheet: { create } }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));

const factory = createThemedStyles((colors, { spacing, radius }) => ({
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.md }
}));

it('builds one sheet per theme and reuses it', () => {
  const light = themedStyles(factory, lightColors);
  const dark = themedStyles(factory, darkColors);
  expect(light.card).toEqual({ backgroundColor: lightColors.card, padding: tokens.spacing.lg, borderRadius: tokens.radius.md });
  expect(dark.card.backgroundColor).toBe(darkColors.card);
  expect(themedStyles(factory, lightColors)).toBe(light);
  expect(themedStyles(factory, darkColors)).toBe(dark);
  expect(create).toHaveBeenCalledTimes(2);
});

it('detects the dark palette and treats partial test palettes as light', () => {
  expect(isDarkTheme(darkColors)).toBe(true);
  expect(isDarkTheme(lightColors)).toBe(false);
  expect(isDarkTheme({} as typeof lightColors)).toBe(false);
});
