/**
 * Intentional fixed colours that do not follow the light/dark palette: brand artwork,
 * white-on-blue heroes, the login photo backdrop and scan illustrations.
 * Everything else must come from ThemeColors (atomTheme.ts) via useAppTheme()/useThemedStyles().
 * This module, atomTheme.ts and GradientFill.tsx are the only places allowed to hold colour literals.
 */

const white = "#ffffff";

/** Text and glass layers drawn on top of a blue gradient hero (GradientFill "hero"/"accent"). */
export const onHero = {
  ink: white,
  soft: "rgba(255,255,255,0.85)",
  muted: "rgba(255,255,255,0.8)",
  glass: "rgba(255,255,255,0.22)",
  chip: "rgba(255,255,255,0.16)",
  bubble: "rgba(255,255,255,0.10)",
  faintBubble: "rgba(255,255,255,0.08)",
  liveDot: "#7dffc0",
  /** Moving highlight across the scan disc: transparent → light → transparent. */
  sheen: ["rgba(255,255,255,0)", "rgba(255,255,255,0.32)", "rgba(255,255,255,0)"] as const
} as const;

/** White pill button that sits on a blue hero (PrimaryButton variant "inverse"). */
export const inverseButton = { background: white, shadow: "#06143c" } as const;

/** ATOM Minerals hexagon faces (top, left, right) per surface, as in the approved logo. */
export const logoFaces = {
  light: { top: "#1fb5ee", left: "#1846d8", right: "#1d6fe6" },
  dark: { top: "#4cc7ff", left: "#2f62f5", right: "#3a8af8" },
  onBlue: { top: white, left: "rgba(255,255,255,0.95)", right: "#dbe7ff" }
} as const;

/** Atom orbit and highlight drawn over the coloured hexagon. */
export const logoInk = { onFaces: white, onBlueWord: white, onBlueSub: onHero.soft } as const;

/** Assignee avatar on work cards: violet gradient with white initials. */
export const avatar = { stops: ["#8b6cff", "#5b3fd6"] as const, ink: white } as const;

/** Glow under the floating «Создать» button. */
export const createButtonGlow = "0px 10px 22px rgba(36, 87, 245, 0.38)";

/** Matrix rain behind the scan disc and the terminal line under it. */
export const scanMatrix = {
  dark: { rain: "rgba(110,170,255,0.9)", head: "#e3eeff", glow: "rgba(110,170,255,0.9)", dot: "rgba(140,190,255,0.85)", cell: "rgba(110,170,255,0.45)" },
  light: { rain: "rgba(30,91,255,0.55)", head: "#1e5bff", glow: "rgba(30,91,255,0.45)", dot: "rgba(30,91,255,0.55)", cell: "rgba(30,91,255,0.22)" },
  terminal: { dark: "rgba(4,14,30,0.55)", light: "rgba(255,255,255,0.85)" }
} as const;

/** Login screen: the blue photo backdrop stays in both themes; the card follows the theme. */
export const loginHero = {
  backdrop: "#031b36",
  overlay: { light: "rgba(9, 32, 92, 0.55)", dark: "rgba(3, 12, 32, 0.74)" },
  darkCard: "#0b1a2f",
  cardShadow: "#000000",
  ink: white,
  inkSoft: onHero.soft,
  subtitle: "#a9c5e7",
  link: "#9db7d7",
  secondaryCard: "rgba(5, 31, 58, 0.72)",
  secondaryBorder: "rgba(122, 177, 232, 0.36)",
  phoneIcon: "#16a8ff",
  chevron: "#d6e9ff",
  /** The sign-in button keeps the light-theme accent in both themes. */
  button: "#2457f5",
  buttonPressed: "#1846d8",
  quietLight: { background: "#edf3ff", border: "#c9d9ff" }
} as const;

/** Session-recovery error screens (app/index, SessionGate): one fixed light look, not yet themed. */
export const recoveryScreen = {
  background: "#f4f7fb",
  title: "#14233d",
  message: "#53627b",
  action: "#1769e0",
  onAction: white
} as const;

/**
 * Light-only colours still rendered as-is in both themes. Kept here so they stay visible and
 * searchable until a design pass maps them to theme tokens (they do not adapt to dark mode).
 */
export const fixedLight = {
  /** Offline emergency profile card. */
  emergencyLabel: "#64748b",
  emergencyTitle: "#0f172a",
  emergencyText: "#475569",
  /** Error text on settings/account and patrol request screens. */
  errorText: "#ef4444",
  /** Outline of the patrol request «more actions» button. */
  outline: "#dbe5f2",
  /** Diagnostics error and feedback callouts. */
  errorCallout: { background: "#fff1f1", border: "#fecaca", text: "#991b1b" },
  infoCallout: { background: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  /** Server connection check result. */
  statusSuccess: "#ecfdf3",
  statusError: "#fef2f2"
} as const;
