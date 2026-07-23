export type PointDraftSelectedStatus = "ok" | "issue" | "skipped" | null;

export const skippedPointDraftReason = "Метка недоступна";

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
  const selectedStatus = input.selectedStatus ?? restoreDeferredPointSelection(persisted);
  const issueTypeId = selectedStatus === "issue"
    ? input.issueTypeId?.trim() || persisted.issueTypeId?.trim() || "Неисправность"
    : null;

  return {
    selectedStatus,
    comment: input.comment ?? null,
    issueTypeId,
    deferredReason: input.reason?.trim()
      || (selectedStatus === "skipped" ? skippedPointDraftReason : "Заполнить позже")
  };
}

export function restoreDeferredPointSelection(persisted: PersistedPointDraft): PointDraftSelectedStatus {
  if (persisted.deferredReason === skippedPointDraftReason) {
    return "skipped";
  }

  return persisted.issueTypeId ? "issue" : "ok";
}
