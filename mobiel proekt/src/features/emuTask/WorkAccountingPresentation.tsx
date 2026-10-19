import { createThemedStyles, useThemedStyles } from "@/ui/useThemedStyles";

import { ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { WorkItemDto, WorkTaskStatus } from "@/domain/emu/emuTypes";

export function statusLabel(status: WorkTaskStatus) {
  const labels: Record<WorkTaskStatus, string> = {
    available: "Доступна",
    assigned: "Назначена",
    new: "Новая",
    accepted: "Назначена",
    inProgress: "В работе",
    paused: "Пауза",
    completedLocal: "Завершена локально",
    completedServer: "Завершена",
    cancelled: "Отменена",
    conflict: "Конфликт"
  };

  return labels[status] ?? status;
}

export function formatParticipants(task: WorkItemDto) {
  const participants = task.actualParticipants.length > 0 ? task.actualParticipants : task.assignedEmployees;
  return participants.length > 0
    ? participants.map((participant) => formatShortName(participant.fullName)).join(", ")
    : "не указаны";
}

export function formatWorkAttachments(task: WorkItemDto) {
  const serverCount = task.attachments?.length ?? 0;
  const localCount = task.localAttachmentCount ?? 0;
  const photoCount = task.localPhotoCount ?? task.attachments?.filter((item) => item.contentType.startsWith("image/")).length ?? 0;
  const videoCount = task.localVideoCount ?? task.attachments?.filter((item) => item.contentType.startsWith("video/")).length ?? 0;
  const total = Math.max(serverCount, localCount);
  if (total === 0) {
    return "Вложения: нет";
  }

  const pendingLabel = localCount > serverCount ? `, ожидают отправки: ${localCount - serverCount}` : "";
  return `Вложения: ${total}. Фото: ${photoCount}, видео: ${videoCount}${pendingLabel}`;
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

export function workDeliveryPresentation(syncStatus: string) {
  if (syncStatus === "synced" || syncStatus === "accepted" || syncStatus === "duplicate") {
    return { label: "Получено сервером", tone: "success" as const };
  }
  if (syncStatus === "sending") return { label: "Отправляется", tone: "neutral" as const };
  if (["rejected", "conflict", "invalidPayload", "wrong_contour"].includes(syncStatus)) {
    return { label: "Требуется действие", tone: "danger" as const };
  }
  return { label: "Сохранено на телефоне", tone: "warning" as const };
}

export function remarkStatusLabel(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "Отправлено";
  }
  if (status === "rejected" || status === "conflict") {
    return "Ошибка";
  }
  return "Ожидает";
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
    return "не указан";
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
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export function useWorkAccountingStyles() {
  return useThemedStyles(createStyles);
}
const createStyles = createThemedStyles((colors) => ({
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: {
    gap: 8
  },
  cardTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  },
  choice: {
    minHeight: 48,
    justifyContent: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  choiceActive: {
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.primary
  },
  choiceText: {
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  choiceTextActive: {
    color: colors.primary
  },
  field: {
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    width: 48
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  input: {
    backgroundColor: colors.field,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  label: {
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  disabledAction: {
    opacity: 0.45
  },
  menuBackdrop: {
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: "flex-end",
    padding: 18
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    gap: 10,
    padding: 16
  },
  menuSecondaryAction: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  menuSecondaryDanger: {
    color: colors.danger
  },
  menuSecondaryList: {
    gap: 8
  },
  menuSecondaryPressed: {
    opacity: 0.72
  },
  menuSecondaryText: {
    color: colors.primary,
    flex: 1,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  menuSubtitle: {
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    lineHeight: 20,
    marginHorizontal: 18,
    marginTop: -8
  },
  message: {
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modalActions: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "column",
    gap: 10,
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 6
  },
  modalBackdrop: {
    backgroundColor: colors.scrim,
    flex: 1,
    padding: 16,
    justifyContent: "center"
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    maxHeight: "100%",
    overflow: "hidden",
    padding: 0
  },
  modalScroll: {
    flexShrink: 1,
    flexGrow: 0
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontFamily: "Manrope_800ExtraBold",
    margin: 18,
    marginBottom: 12
  },
  muted: {
    fontSize: 14,
    lineHeight: 20
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  readOnlyValue: {
    backgroundColor: colors.background,
    borderRadius: 10,
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    padding: 12
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  segment: {
    backgroundColor: colors.backgroundAccent,
    borderRadius: 12,
    flexDirection: "row",
    padding: 4
  },
  segmentButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    paddingVertical: 10
  },
  segmentButtonActive: {
    backgroundColor: colors.primary
  },
  segmentText: {
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  segmentTextActive: {
    color: colors.onPrimary
  },
  text: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 21
  },
  textarea: {
    minHeight: 88
  },
  titleBox: {
    flex: 1,
    gap: 5
  }
}));
