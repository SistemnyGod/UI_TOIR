import { StyleSheet } from "react-native";

import { ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { WorkItemDto, WorkTaskStatus } from "@/domain/emu/emuTypes";

export function statusLabel(status: WorkTaskStatus) {
  const labels: Record<WorkTaskStatus, string> = {
    available: "Р”РѕСЃС‚СѓРїРЅР°",
    assigned: "РќР°Р·РЅР°С‡РµРЅР°",
    new: "РќРѕРІР°СЏ",
    accepted: "РќР°Р·РЅР°С‡РµРЅР°",
    inProgress: "Р’ СЂР°Р±РѕС‚Рµ",
    paused: "РџР°СѓР·Р°",
    completedLocal: "Р—Р°РІРµСЂС€РµРЅР° Р»РѕРєР°Р»СЊРЅРѕ",
    completedServer: "Р—Р°РІРµСЂС€РµРЅР°",
    cancelled: "РћС‚РјРµРЅРµРЅР°",
    conflict: "РљРѕРЅС„Р»РёРєС‚"
  };

  return labels[status] ?? status;
}

export function formatParticipants(task: WorkItemDto) {
  const participants = task.actualParticipants.length > 0 ? task.actualParticipants : task.assignedEmployees;
  return participants.length > 0
    ? participants.map((participant) => formatShortName(participant.fullName)).join(", ")
    : "РЅРµ СѓРєР°Р·Р°РЅС‹";
}

export function formatWorkAttachments(task: WorkItemDto) {
  const serverCount = task.attachments?.length ?? 0;
  const localCount = task.localAttachmentCount ?? 0;
  const photoCount = task.localPhotoCount ?? task.attachments?.filter((item) => item.contentType.startsWith("image/")).length ?? 0;
  const videoCount = task.localVideoCount ?? task.attachments?.filter((item) => item.contentType.startsWith("video/")).length ?? 0;
  const total = Math.max(serverCount, localCount);
  if (total === 0) {
    return "Р’Р»РѕР¶РµРЅРёСЏ: РЅРµС‚";
  }

  const pendingLabel = localCount > serverCount ? `, РѕР¶РёРґР°СЋС‚ РѕС‚РїСЂР°РІРєРё: ${localCount - serverCount}` : "";
  return `Р’Р»РѕР¶РµРЅРёСЏ: ${total}. Р¤РѕС‚Рѕ: ${photoCount}, РІРёРґРµРѕ: ${videoCount}${pendingLabel}`;
}

export function statusTone(status: WorkTaskStatus) {
  if (status === "completedServer" || status === "completedLocal") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  if (status === "cancelled" || status === "conflict") {
    return "danger";
  }
  return "neutral";
}

export function remarkStatusLabel(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "РћС‚РїСЂР°РІР»РµРЅРѕ";
  }
  if (status === "rejected" || status === "conflict") {
    return "РћС€РёР±РєР°";
  }
  return "РћР¶РёРґР°РµС‚";
}

export function remarkStatusTone(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "success";
  }
  if (status === "rejected" || status === "conflict") {
    return "danger";
  }
  return "warning";
}

export function formatShortName(fullName: string | null | undefined) {
  if (!fullName?.trim()) {
    return "РЅРµ СѓРєР°Р·Р°РЅ";
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0];
  }

  const [lastName, firstName, middleName] = parts;
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join("");

  return initials ? `${lastName} ${initials}` : lastName;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Р”Р°С‚Р° РЅРµ СѓРєР°Р·Р°РЅР°";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export const workAccountingStyles = StyleSheet.create({
  actions: {
    gap: 8
  },
  cardTitle: {
    color: "#0f1a2b",
    flex: 1,
    fontSize: 18,
    fontWeight: "800"
  },
  choice: {
    borderColor: "#dbe5f2",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  choiceActive: {
    backgroundColor: "#eaf1ff",
    borderColor: "#1e5bff"
  },
  choiceText: {
    color: "#42526b",
    fontSize: 13,
    fontWeight: "800"
  },
  choiceTextActive: {
    color: "#1e5bff"
  },
  field: {
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 42
  },
  helperText: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0f1a2b",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  label: {
    color: "#42526b",
    fontSize: 13,
    fontWeight: "800"
  },
  disabledAction: {
    opacity: 0.45
  },
  menuBackdrop: {
    backgroundColor: "rgba(15, 26, 43, 0.22)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 18
  },
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    gap: 10,
    padding: 16
  },
  menuSecondaryAction: {
    alignItems: "center",
    borderColor: "#e5edf7",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  menuSecondaryDanger: {
    color: "#ef4444"
  },
  menuSecondaryList: {
    gap: 8
  },
  menuSecondaryPressed: {
    opacity: 0.72
  },
  menuSecondaryText: {
    color: "#1e5bff",
    flex: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  menuSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginHorizontal: 18,
    marginTop: -8
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modalActions: {
    borderColor: "#e5edf7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12
  },
  modalBackdrop: {
    backgroundColor: "rgba(15, 26, 43, 0.28)",
    flex: 1,
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "92%",
    overflow: "hidden",
    padding: 0
  },
  modalScroll: {
    flexGrow: 0
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18
  },
  modalTitle: {
    color: "#0f1a2b",
    fontSize: 20,
    fontWeight: "900",
    margin: 18,
    marginBottom: 12
  },
  muted: {
    fontSize: 13,
    lineHeight: 18
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  readOnlyValue: {
    backgroundColor: "#f5f7fa",
    borderRadius: 10,
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
    padding: 12
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  segment: {
    backgroundColor: "#edf2f8",
    borderRadius: 12,
    flexDirection: "row",
    padding: 4
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    paddingVertical: 10
  },
  segmentButtonActive: {
    backgroundColor: "#1e5bff"
  },
  segmentText: {
    color: "#42526b",
    fontSize: 14,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: "#fff"
  },
  text: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 21
  },
  textarea: {
    minHeight: 88
  },
  titleBox: {
    flex: 1,
    gap: 5
  }
});
