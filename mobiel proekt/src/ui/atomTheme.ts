/** Available during startup, before SQLite or the session has initialized. */
export const lightColors = {
  background: "#f4f7fb", backgroundAccent: "#e8f0ff", border: "#dfe7f2", card: "#ffffff",
  mutedText: "#52637b", onDark: "#f5f7fa", navBackground: "#ffffff", navBorder: "#e3eaf4",
  primary: "#1e5bff", primaryPressed: "#1846d8", onPrimary: "#ffffff", text: "#0f1a2b",
  success: "#167044", successSurface: "#e6f6ec", warning: "#885000", warningSurface: "#fff3dc",
  danger: "#b42336", dangerSurface: "#ffeef1", field: "#f7f9fc", placeholder: "#62738a",
  disabled: "#e1e7ef", disabledText: "#536277", scrim: "rgba(4, 15, 30, 0.42)", brand: "#0096d6",
  /** Filled surfaces (buttons, active tab, badges) always carry white text. */
  accent: "#2457f5", accentPressed: "#1846d8", onAccent: "#ffffff",
  header: "#e8f0ff", cardBorder: "#e6edf6", tile: "#ecf2ff", faintText: "#66768c",
  successFill: "#167f4b", dangerFill: "#c8304a", warningFill: "#d08200", track: "#e3eaf4",
  shadow: "#0f1a2b", focusRing: "rgba(30, 91, 255, 0.14)"
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: "#071426", backgroundAccent: "#13284a", border: "#24395a", card: "#0e1e34",
  mutedText: "#b0bed1", onDark: "#f5f7fa", navBackground: "#11223a", navBorder: "#22344d",
  primary: "#9dbbff", primaryPressed: "#b5ccff", onPrimary: "#071426", text: "#f5f7fa",
  success: "#7fe0ae", successSurface: "#113c30", warning: "#ffcf80", warningSurface: "#3b2c15",
  danger: "#ff9ba8", dangerSurface: "#421f30", field: "#0e1e34", placeholder: "#94a5bc",
  disabled: "#26364c", disabledText: "#a9b8cb", scrim: "rgba(0, 5, 14, 0.66)", brand: "#4cc7ff",
  accent: "#2f62f5", accentPressed: "#2550d8", onAccent: "#ffffff",
  header: "#0c2649", cardBorder: "#1f324c", tile: "#162c4d", faintText: "#8597ae",
  successFill: "#167f4b", dangerFill: "#c8304a", warningFill: "#e08e10", track: "rgba(255, 255, 255, 0.10)",
  shadow: "#000000", focusRing: "rgba(122, 160, 255, 0.16)"
};
export type StatusTone = "neutral" | "success" | "warning" | "danger";
export function toneColors(colors: ThemeColors, tone: StatusTone) {
  return tone === "neutral"
    ? { foreground: colors.mutedText, background: colors.backgroundAccent }
    : { foreground: colors[tone], background: colors[`${tone}Surface`] };
}
/** Solid fill for a tone, used for icon tiles and badges that carry white glyphs. */
export function toneFill(colors: ThemeColors, tone: StatusTone) {
  return tone === "success" ? colors.successFill : tone === "danger" ? colors.dangerFill : tone === "warning" ? colors.warningFill : colors.accent;
}
