import { StyleSheet } from "react-native";

import { recoveryScreen } from "@/ui/brandPalette";

/** Shared look of the session-recovery error and loading screens (app/index, SessionGate). */
export const recoveryScreenStyles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  errorScreen: {
    alignItems: "center",
    backgroundColor: recoveryScreen.background,
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  errorTitle: {
    color: recoveryScreen.title,
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    textAlign: "center"
  },
  errorMessage: {
    color: recoveryScreen.message,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 420,
    textAlign: "center"
  },
  retryButton: {
    backgroundColor: recoveryScreen.action,
    borderRadius: 12,
    marginTop: 24,
    minWidth: 144,
    paddingHorizontal: 22,
    paddingVertical: 13
  },
  retryButtonPressed: {
    opacity: 0.78
  },
  retryButtonText: {
    color: recoveryScreen.onAction,
    fontSize: 15,
    fontFamily: "Manrope_800ExtraBold"
  }
});
