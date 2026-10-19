export type PointDraftSelectedStatus = "ok" | "issue" | "skipped" | null;

export const skippedPointDraftReason = "Метка недоступна";
export const unselectedPointDraftReason = "Результат не выбран";

type PointDraftInput = {
  selectedStatus?: PointDraftSelectedStatus;
  comment?: string | null;
  issueTypeId?: string | null;
  reason?: string | null;
};

type PersistedPointDraft = {
  issueTypeId?: string | null;
  deferredReason?: string | null;
};

export function normalizePointDraft(input: PointDraftInput, persisted: PersistedPointDraft = {}) {
  const selectedStatus = input.selectedStatus === undefined ? restoreDeferredPointSelection(persisted) : input.selectedStatus;
  const issueTypeId = selectedStatus === "issue"
    ? input.issueTypeId?.trim() || persisted.issueTypeId?.trim() || "Неисправность"
    : null;

  return {
    selectedStatus,
    comment: input.comment ?? null,
    issueTypeId,
    deferredReason: selectedStatus === null ? unselectedPointDraftReason : input.reason?.trim()
      || (selectedStatus === "skipped" ? skippedPointDraftReason : "Заполнить позже")
  };
}

export function restoreDeferredPointSelection(persisted: PersistedPointDraft): PointDraftSelectedStatus {
  if (persisted.deferredReason === unselectedPointDraftReason) return null;
  if (persisted.deferredReason === skippedPointDraftReason) {
    return "skipped";
  }

  return persisted.issueTypeId ? "issue" : "ok";
}
