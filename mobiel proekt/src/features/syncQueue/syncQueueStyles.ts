import { StyleSheet } from "react-native";

export const queueStyles = StyleSheet.create({
  actionGroup: {
    gap: 8
  },
  errorPreview: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  errorText: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  feedback: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold"
  },
  itemTitleBox: {
    flex: 1,
    gap: 3
  },
  itemTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  metaGrid: {
    borderRadius: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 8
  },
  authNotice: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1
  },
  authNoticeTitle: {
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold"
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    lineHeight: 18,
    padding: 10
  },
  queueItem: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  title: {
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  }
});
