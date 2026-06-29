import { assignmentStatusText, assignmentStatusTone } from "./assignmentUtils";

export function AssignmentStatusBadge({ value }: { value: string }) {
  return <span className={`assign-am-status ${assignmentStatusTone(value)}`}>{assignmentStatusText(value)}</span>;
}

