import { radius } from "@/ui/typography";

/** Layout scale shared by every screen; prefer these over one-off paddings and gaps. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Text sizes in use across the app, smallest to largest. */
export const fontSize = {
  micro: 10,
  caption: 11,
  small: 12,
  label: 13,
  body: 14,
  bodyLarge: 15,
  input: 16,
  lead: 17,
  title: 18,
  heading: 20,
  display: 22,
  hero: 30
} as const;

export { radius };

/** Non-colour design tokens handed to every themed style factory. */
export const tokens = { spacing, radius, fontSize } as const;
export type DesignTokens = typeof tokens;
