import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type { ThemeColors } from "@/ui/atomTheme";
import { useAppTheme } from "@/features/settings/themePreference";

export function usePointStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: -0.3,
    lineHeight: 28
  },
  text: {
    fontSize: 16,
    lineHeight: 21
  },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: "Manrope_700Bold" },
  input: {
    borderColor: colors.cardBorder,
    borderRadius: 14,
    borderWidth: 1.5,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 110
  },
  statusScreen: { flexGrow: 1 },
  statusCenter: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24 },
  statusGrid: { width: "100%", maxWidth: 560, flexDirection: "row", alignItems: "stretch", gap: 12 },
  statusStack: { flexDirection: "column" },
  statusButton: { flex: 1, minHeight: 156, alignItems: "center", justifyContent: "center", gap: 16, borderRadius: 24, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 24 },
  statusButtonStack: { flex: 0, minHeight: 120, flexDirection: "row", paddingHorizontal: 20 },
  statusIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  statusText: { flexShrink: 1, fontSize: 20, lineHeight: 26, textAlign: "center" },
  guidanceBlock: {
    gap: 5
  },
  mediaProgress: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  photoNote: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  photoHeader: {
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  emptyPhotoBox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 40,
    padding: 8,
    justifyContent: "center"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  photoTile: {
    gap: 6,
    width: 96
  },
  photo: {
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: colors.backgroundAccent,
    width: "100%"
  },
  photoStatus: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  videoTile: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    width: "100%"
  },
  videoLabel: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
    marginTop: 4
  },
  savingNotice: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    marginRight: 8
  },
  moreButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  voiceButton: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  voiceHint: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  notices: { gap: 8 },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20
  }
});
