/** Available during startup, before SQLite or the session has initialized. */
export const lightColors = {
  background: "#f4f7fb", backgroundAccent: "#e8f1ff", border: "#dbe5f2", card: "#ffffff",
  mutedText: "#52637b", onDark: "#f5f7fa", navBackground: "#ffffff", navBorder: "#dbe5f2",
  primary: "#1e5bff", primaryPressed: "#1552e8", onPrimary: "#ffffff", text: "#0f1a2b",
  success: "#167044", successSurface: "#eaf7ef", warning: "#885000", warningSurface: "#fff4dc",
  danger: "#b42336", dangerSurface: "#fff0f2", field: "#ffffff", placeholder: "#62738a",
  disabled: "#e1e7ef", disabledText: "#536277", scrim: "rgba(4, 15, 30, 0.56)", brand: "#00a7e5"
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: "#071426", backgroundAccent: "#0b2342", border: "#344660", card: "#0f1f35",
  mutedText: "#b6c2d2", onDark: "#f5f7fa", navBackground: "#0d1d33", navBorder: "#344660",
  primary: "#8aafff", primaryPressed: "#a3bfff", onPrimary: "#071426", text: "#f5f7fa",
  success: "#83dfb0", successSurface: "#113c30", warning: "#ffcf80", warningSurface: "#3b2c15",
  danger: "#ff9ba8", dangerSurface: "#421f30", field: "#13273f", placeholder: "#acbbd0",
  disabled: "#26364c", disabledText: "#a9b8cb", scrim: "rgba(0, 5, 14, 0.72)", brand: "#39bfff"
};
export type StatusTone = "neutral" | "success" | "warning" | "danger";
export function toneColors(colors: ThemeColors, tone: StatusTone) {
  return tone === "neutral"
    ? { foreground: colors.mutedText, background: colors.backgroundAccent }
    : { foreground: colors[tone], background: colors[`${tone}Surface`] };
}
