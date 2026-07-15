const terminalRequestStatusTokens = [
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "заверш",
  "закрыт",
  "отмен",
] as const;

export function normalizePatrolRequestStatus(status: string | undefined | null) {
  return String(status ?? "").trim().toLocaleLowerCase("ru-RU");
}

export function isTerminalPatrolRequestStatus(status: string | undefined | null) {
  const normalized = normalizePatrolRequestStatus(status);
  return terminalRequestStatusTokens.some((token) => normalized.includes(token));
}
