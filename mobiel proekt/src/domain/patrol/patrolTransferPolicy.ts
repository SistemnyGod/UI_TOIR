/** Handover of an unfinished patrol to another employee of the shift. */

export type TransferCandidate = {
  employeeId: string;
  fullName: string;
  position: string | null;
  sameAccount: boolean;
  hasPatrolInProgress: boolean;
};

export type TransferMode = "sameDevice" | "otherDevice";

export const transferableStatuses = new Set(["inProgress", "paused"]);

/**
 * Colleagues offered on the handover screen. The server list (when the phone
 * is online) adds employees of other phones; offline only the employees bound
 * to this phone are known, and a handover to them works without a network.
 */
export function mergeTransferCandidates(
  local: readonly TransferCandidate[],
  server: readonly TransferCandidate[] | null,
  currentPerformerId: string | null
): TransferCandidate[] {
  const byId = new Map<string, TransferCandidate>();
  for (const candidate of server ?? []) byId.set(candidate.employeeId, candidate);
  for (const candidate of local) {
    const known = byId.get(candidate.employeeId);
    // The phone's own list is authoritative for "same phone" and for patrols
    // started here but not yet sent.
    byId.set(candidate.employeeId, known
      ? { ...known, sameAccount: true, hasPatrolInProgress: known.hasPatrolInProgress || candidate.hasPatrolInProgress }
      : candidate);
  }
  return Array.from(byId.values())
    .filter((candidate) => candidate.employeeId !== currentPerformerId)
    .sort((left, right) => Number(right.sameAccount) - Number(left.sameAccount)
      || left.fullName.localeCompare(right.fullName, "ru"));
}

/** Why the employee cannot pick this colleague right now, or null. */
export function transferCandidateBlocker(candidate: TransferCandidate, patrolStatus: string, online: boolean): string | null {
  if (!candidate.sameAccount && !online) return "Нужна связь с сервером: коллега работает на другом телефоне.";
  // On this phone the colleague continues at once, so the slot must be free.
  // On another phone the patrol arrives paused and waits.
  if (candidate.sameAccount && patrolStatus === "inProgress" && candidate.hasPatrolInProgress) {
    return "У сотрудника уже есть начатый обход.";
  }
  return null;
}

export function transferModeFor(candidate: TransferCandidate): TransferMode {
  return candidate.sameAccount ? "sameDevice" : "otherDevice";
}

const reasonLabels: Record<string, string> = {
  transferPerformerChanged: "Исполнитель обхода уже изменился на сервере. Обновите данные.",
  transferTargetUnavailable: "У коллеги нет активного мобильного аккаунта.",
  transferTargetBusy: "Коллега уже выполняет другой обход.",
  transferPhotosMissing: "Фото заполненных точек ещё не загружены. Повторите отправку при хорошей связи.",
  assignmentClosed: "Обход уже закрыт.",
  assignmentNeedsDecision: "Обход ждёт решения диспетчера.",
  assignmentNotInProgress: "Передать можно только начатый обход."
};

export function transferRefusalMessage(reasonCode: string | null | undefined, fallback: string) {
  return (reasonCode && reasonLabels[reasonCode]) || fallback;
}
