export type LocalStatusTone = "success" | "warning" | "danger" | "neutral";

export type LocalStatusView = {
  label: "Сохранено" | "Ожидает отправки" | "Отправлено" | "Есть ошибка";
  tone: LocalStatusTone;
};

export function getAssignmentStatusView(status: string): LocalStatusView {
  if (status === "completedServer") {
    return { label: "Отправлено", tone: "success" };
  }

  if (status === "completedLocal") {
    return { label: "Ожидает отправки", tone: "warning" };
  }

  if (status === "conflict" || status === "rejected") {
    return { label: "Есть ошибка", tone: "danger" };
  }

  return { label: "Сохранено", tone: "success" };
}

export function getQueueStatusView(status?: string | null): LocalStatusView {
  if (status === "accepted" || status === "duplicate" || status === "uploaded" || status === "linked" || status === "synced") {
    return { label: "Отправлено", tone: "success" };
  }

  if (status === "conflict" || status === "rejected" || status === "failed") {
    return { label: "Есть ошибка", tone: "danger" };
  }

  if (status === "pending" || status === "sending" || status === "retryLater" || status === "queued" || status === "uploading") {
    return { label: "Ожидает отправки", tone: "warning" };
  }

  return { label: "Сохранено", tone: "success" };
}
