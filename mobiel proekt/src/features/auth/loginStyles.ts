import { StyleSheet } from "react-native";

import type { ThemeColors } from "@/ui/atomTheme";

export const loginStyles = StyleSheet.create({
  background: {
    backgroundColor: "#031b36",
    flex: 1
  },
  overlay: {
    backgroundColor: "rgba(9, 32, 92, 0.55)",
    flex: 1
  },
  safe: {
    flex: 1
  },
  keyboard: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  logoBlock: {
    alignItems: "center",
    marginBottom: 14
  },
  mark: { alignItems: "center", height: 64, justifyContent: "center", marginBottom: 12, width: 64 },
  logoText: {
    color: "#ffffff",
    fontSize: 34,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 5,
    lineHeight: 40,
    textAlign: "center"
  },
  logoSubText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Manrope_700Bold",
    letterSpacing: 6,
    textAlign: "center"
  },
  title: {
    color: "#ffffff",
    fontSize: 21,
    fontFamily: "Manrope_800ExtraBold",
    lineHeight: 26,
    marginTop: 18,
    textAlign: "center"
  },
  subtitle: {
    color: "#a9c5e7",
    fontSize: 16,
    lineHeight: 20,
    marginTop: 5,
    textAlign: "center"
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e6edf6",
    borderRadius: 28,
    borderWidth: 1,
    elevation: 12,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 16
  },
  label: {
    color: "#52637b",
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    marginBottom: 6
  },
  passwordLabel: {
    marginTop: 14
  },
  inputBox: {
    alignItems: "center",
    backgroundColor: "#f7f9fc",
    borderColor: "#dfe7f2",
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingVertical: 6,
    paddingHorizontal: 13
  },
  input: {
    color: "#0f1a2b",
    flex: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 16,
    minHeight: 48,
    paddingVertical: 8
  },
  rowBetween: {
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14
  },
  rememberRow: {
    minHeight: 48,
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#2457f5",
    borderRadius: 8,
    borderWidth: 1.8,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  checkboxActive: {
    backgroundColor: "#2457f5"
  },
  savedPasswordHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  recoveryLink: {
    justifyContent: "center",
    minHeight: 48
  },
  quietButton: {
    elevation: 0,
    shadowOpacity: 0
  },
  rememberText: {
    color: "#0f1a2b",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    flexShrink: 1
  },
  link: {
    color: "#1e5bff",
    fontFamily: "Manrope_700Bold",
    fontSize: 14
  },
  error: {
    color: "#b42336",
    fontSize: 14,
    lineHeight: 18,
    marginTop: 10
  },
  loginButton: {
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#2457f5",
    borderRadius: 18,
    elevation: 6,
    minHeight: 56,
    shadowColor: "#2457f5",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: "center",
    marginTop: 18
  },
  loginButtonPressed: {
    backgroundColor: "#1846d8",
    transform: [{ scale: 0.97 }]
  },
  loginButtonDisabled: {
    opacity: 0.68
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 26,
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold"
  },
  quickLoginWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  line: {
    backgroundColor: "#e3eaf4",
    flex: 1,
    height: 1
  },
  quickLoginText: {
    color: "#66768c",
    fontSize: 14,
    flexShrink: 1
  },
  fingerprintButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#edf3ff",
    borderColor: "#c9d9ff",
    borderRadius: 27,
    borderWidth: 1.5,
    height: 54,
    justifyContent: "center",
    marginTop: 10,
    width: 54
  },
  fingerprintText: {
    color: "#52637b",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center"
  },
  offlineSessionText: {
    color: "#52637b",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center"
  },
  serverQuickLink: {
    minHeight: 48,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 4
  },
  serverQuickLinkText: {
    color: "#9db7d7",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  secondaryCard: {
    backgroundColor: "rgba(5, 31, 58, 0.72)",
    borderColor: "rgba(122, 177, 232, 0.36)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5
  },
  secondaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 48
  },
  secondaryText: {
    color: "#ffffff",
    flex: 1,
    fontSize: 14
  },
  footer: {
    color: "#9db7d7",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center"
  }
});

/** Theme-dependent colours; the blue photo hero stays, the card follows the light or dark theme. */
export function loginSkin(colors: ThemeColors, dark: boolean) {
  return {
    overlay: { backgroundColor: dark ? "rgba(3, 12, 32, 0.74)" : "rgba(9, 32, 92, 0.55)" },
    card: { backgroundColor: dark ? "#0b1a2f" : colors.card, borderColor: colors.cardBorder, shadowOpacity: dark ? 0.5 : 0.32 },
    inputBox: { backgroundColor: colors.field, borderColor: colors.border },
    text: { color: colors.text },
    muted: { color: colors.mutedText },
    faint: { color: colors.faintText },
    link: { color: colors.primary },
    error: { color: colors.danger },
    line: { backgroundColor: colors.border },
    checkbox: { borderColor: dark ? colors.primary : colors.accent },
    quiet: { backgroundColor: dark ? colors.tile : "#edf3ff", borderColor: dark ? colors.cardBorder : "#c9d9ff" }
  };
}

export type LoginSkin = ReturnType<typeof loginSkin>;
