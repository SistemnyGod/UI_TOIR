import type { SelectedStatus } from "./pointFillTypes";

/** These are inspection results, not tag-reading methods. */
export const inspectionChoices: readonly { status: SelectedStatus; label: string; description: string; tone: "success" | "danger" | "warning" }[] = [
  { status: "ok", label: "Исправно", description: "Объект работает нормально", tone: "success" },
  { status: "issue", label: "Неисправно", description: "Есть неисправность или отклонение", tone: "danger" },
  { status: "skipped", label: "Осмотр невозможен", description: "Нет доступа к оборудованию", tone: "warning" }
];

export function needsManualInspectionReason(point: { confirmationType?: string | null; status?: string } | null) {
  // Legacy completed results remain editable; beginning a new manual inspection
  // would reject or reset them. Existing repository validation still applies.
  return Boolean(point && !point.confirmationType && !["ok", "issue", "skipped"].includes(point.status ?? ""));
}
