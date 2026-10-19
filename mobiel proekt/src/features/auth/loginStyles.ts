import { loginHero } from "@/ui/brandPalette";
import { createThemedStyles, isDarkTheme } from "@/ui/useThemedStyles";

/** The blue photo hero stays in both themes; the card follows the light or dark theme. */
export const createLoginStyles = createThemedStyles((colors, { spacing }) => {
  const dark = isDarkTheme(colors);
  return {
    background: {
      backgroundColor: loginHero.backdrop,
      flex: 1
    },
    overlay: {
      backgroundColor: dark ? loginHero.overlay.dark : loginHero.overlay.light,
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
      color: loginHero.ink,
      fontSize: 34,
      fontFamily: "Manrope_800ExtraBold",
      letterSpacing: 5,
      lineHeight: 40,
      textAlign: "center"
    },
    logoSubText: {
      color: loginHero.inkSoft,
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
      letterSpacing: 6,
      textAlign: "center"
    },
    title: {
      color: loginHero.ink,
      fontSize: 21,
      fontFamily: "Manrope_800ExtraBold",
      lineHeight: 26,
      marginTop: 18,
      textAlign: "center"
    },
    subtitle: {
      color: loginHero.subtitle,
      fontSize: 16,
      lineHeight: 20,
      marginTop: 5,
      textAlign: "center"
    },
    card: {
      backgroundColor: dark ? loginHero.darkCard : colors.card,
      borderColor: colors.cardBorder,
      borderRadius: 28,
      borderWidth: 1,
      elevation: 12,
      padding: 20,
      shadowColor: loginHero.cardShadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: dark ? 0.5 : 0.32,
      shadowRadius: 16
    },
    label: {
      color: colors.mutedText,
      fontSize: 13,
      fontFamily: "Manrope_700Bold",
      marginBottom: 6
    },
    passwordLabel: {
      marginTop: 14
    },
    inputBox: {
      alignItems: "center",
      backgroundColor: colors.field,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 10,
      minHeight: 54,
      paddingVertical: 6,
      paddingHorizontal: 13
    },
    input: {
      color: colors.text,
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
      borderColor: dark ? colors.primary : colors.accent,
      borderRadius: 8,
      borderWidth: 1.8,
      height: 24,
      justifyContent: "center",
      width: 24
    },
    checkboxActive: {
      backgroundColor: loginHero.button
    },
    savedPasswordHint: {
      color: colors.faintText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6
    },
    savedPasswordHintBlocked: {
      color: colors.danger
    },
    recoveryLink: {
      justifyContent: "center",
      minHeight: 48
    },
    quietButton: {
      backgroundColor: dark ? colors.tile : loginHero.quietLight.background,
      elevation: 0,
      shadowOpacity: 0
    },
    rememberText: {
      color: colors.text,
      fontFamily: "Manrope_700Bold",
      fontSize: 14,
      flexShrink: 1
    },
    link: {
      color: colors.primary,
      fontFamily: "Manrope_700Bold",
      fontSize: 14
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 18,
      marginTop: 10
    },
    loginButton: {
      alignItems: "center",
      overflow: "hidden",
      backgroundColor: loginHero.button,
      borderRadius: 18,
      elevation: 6,
      minHeight: 56,
      shadowColor: loginHero.button,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 12,
      justifyContent: "center",
      marginTop: 18
    },
    loginButtonPressed: {
      backgroundColor: loginHero.buttonPressed,
      transform: [{ scale: 0.97 }]
    },
    loginButtonDisabled: {
      opacity: 0.68
    },
    loginButtonText: {
      color: loginHero.ink,
      fontSize: 18,
      lineHeight: 26,
      textAlign: "center",
      fontFamily: "Manrope_800ExtraBold"
    },
    quietButtonText: {
      color: colors.primary
    },
    quickLoginWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 18
    },
    line: {
      backgroundColor: colors.border,
      flex: 1,
      height: 1
    },
    quickLoginText: {
      color: colors.faintText,
      fontSize: 14,
      flexShrink: 1
    },
    fingerprintButton: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: dark ? colors.tile : loginHero.quietLight.background,
      borderColor: dark ? colors.cardBorder : loginHero.quietLight.border,
      borderRadius: 27,
      borderWidth: 1.5,
      height: 54,
      justifyContent: "center",
      marginTop: 10,
      width: 54
    },
    fingerprintText: {
      color: colors.mutedText,
      fontSize: 14,
      marginTop: 6,
      textAlign: "center"
    },
    offlineSessionText: {
      color: colors.mutedText,
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
      color: loginHero.link,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center"
    },
    secondaryCard: {
      backgroundColor: loginHero.secondaryCard,
      borderColor: loginHero.secondaryBorder,
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
      color: loginHero.ink,
      flex: 1,
      fontSize: 14
    },
    footer: {
      color: loginHero.link,
      fontSize: 14,
      marginTop: 12,
      textAlign: "center"
    }
  };
});
