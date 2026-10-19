import { AssignmentCancellationDialog } from "./assignments/AssignmentCancellationDialog";
import type { ReactNode } from "react";
import { AlertTriangle } from "./assignments/AssignmentIcons";
import { PanelHeader, EmptyPanel } from "./assignments/AssignmentPanelParts";
export { PanelHeader, EmptyPanel } from "./assignments/AssignmentPanelParts";
import { shouldCreateAssignmentAfterRequest } from "./assignments/assignmentUtils";
import type { ActivePatrol, CancelAssignmentPayload } from "../../types";

export type { LocalDraft } from "./assignments/assignmentDrafts";
export { ASSIGNMENT_DRAFTS_STORAGE_KEY, createLocalDraftId, loadAssignmentDrafts } from "./assignments/assignmentDrafts";
export { AssignmentDraftsCard as DraftsCard } from "./assignments/AssignmentDraftsCard";
export { CompleteAssignmentModal } from "./assignments/CompleteAssignmentModal";
export { getCompletionRoutePoints } from "./assignments/assignmentCompletion";

export function CancelAssignmentModal({ assignment, ...props }: {
  assignment: ActivePatrol;
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CancelAssignmentPayload) => void | Promise<void>;
  saving?: boolean;
}) {
  return <AssignmentCancellationDialog {...props} summary={{ employee: assignment.employee, route: assignment.route, plannedAt: assignment.plannedAt || "", status: assignment.status }} />;
}

export function mergeAssignmentSources(historyAssignments: ActivePatrol[], liveAssignments: ActivePatrol[]) {
  const merged = new Map<string, ActivePatrol>();
  historyAssignments.forEach((assignment) => merged.set(assignment.id, assignment));
  liveAssignments.forEach((assignment) => merged.set(assignment.id, assignment));
  return Array.from(merged.values());
}

export function ConflictsCard({ conflicts }: { conflicts: Array<{ id: string; type: "danger" | "warning" | "info"; title: string; description: string; time: string }> }) {
  return (
    <section className="assign-am-card">
      <PanelHeader count={conflicts.length} icon={AlertTriangle} title="Конфликты и уведомления" />
      {conflicts.length ? (
        <div className="assign-am-conflicts">
          {conflicts.map((conflict) => (
            <div key={conflict.id}>
              <span className={conflict.type}><AlertTriangle size={16} /></span>
              <div>
                <strong>{conflict.title}</strong>
                <small>{conflict.description}</small>
              </div>
              <em>{conflict.time}</em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel description="Предупреждения появятся при пересечении смен, нехватке сотрудников или потере связи." title="Конфликтов нет" />
      )}
    </section>
  );
}

export function SummaryBlock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="assign-am-summary-block">
      <small>{label}</small>
      <div>{children}</div>
    </div>
  );
}

export function DateTimeField({
  dateValue,
  label,
  onDateChange,
  onTimeChange,
  timeValue,
}: {
  dateValue: string;
  label: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  timeValue: string;
}) {
  return (
    <label className="assign-am-time-row">
      <span>{label}</span>
      <input aria-label={`${label}: дата`} onChange={(event) => onDateChange(event.currentTarget.value)} type="date" value={dateValue} />
      <input aria-label={`${label}: время`} onChange={(event) => onTimeChange(event.currentTarget.value)} type="time" value={timeValue} />
    </label>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="assign-am-avatar">{getInitials(name)}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="assign-am-tag">{children}</span>;
}

export function flattenServerFieldErrors(errors?: Record<string, string[]>): Record<string, string> {
  if (!errors) return {};

  return Object.fromEntries(
    Object.entries(errors)
      .map(([field, messages]) => [field, messages.find(Boolean) ?? "Validation error"] as const)
      .filter(([, message]) => message.length > 0),
  );
}

export function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "С";
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

export { shouldCreateAssignmentAfterRequest };
